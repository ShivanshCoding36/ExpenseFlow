const tf = require('@tensorflow/tfjs');
const CategoryPattern = require('../models/CategoryPattern');
const CategoryTraining = require('../models/CategoryTraining');
const CategoryModel = require('../models/CategoryModel');

class CategorizationService {
  constructor() {
    this.models = new Map(); // Store trained TensorFlow models per user
    this.categories = ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other'];
    this.categoryMap = {
      0: 'food',
      1: 'transport',
      2: 'entertainment',
      3: 'utilities',
      4: 'healthcare',
      5: 'shopping',
      6: 'other'
    };
  }

  // Legacy method for backward compatibility
  categorize(description) {
    const categories = {
      'food': ['restaurant', 'grocery', 'cafe', 'food', 'dining'],
      'transport': ['uber', 'taxi', 'bus', 'train', 'gas', 'fuel', 'parking'],
      'shopping': ['amazon', 'store', 'mall', 'retail', 'clothing'],
      'entertainment': ['movie', 'theater', 'game', 'music', 'event'],
      'utilities': ['electric', 'water', 'gas', 'internet', 'phone', 'utility'],
      'healthcare': ['doctor', 'pharmacy', 'hospital', 'medical', 'dental'],
      'other': []
    };

    const desc = description.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return category;
      }
    }
    return 'other';
  }

  // Convert text to numerical features for ML
  textToFeatures(description, amount = 0) {
    const words = description.toLowerCase().split(/\s+/);
    const features = new Array(50).fill(0); // 50 features

    // Simple bag-of-words features (first 40 positions)
    words.slice(0, 40).forEach((word, index) => {
      if (index < 40) {
        // Simple hash function to convert word to number
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
          hash = ((hash << 5) - hash) + word.charCodeAt(i);
          hash = hash & hash; // Convert to 32-bit integer
        }
        features[index] = (Math.abs(hash) % 1000) / 1000; // Normalize to 0-1
      }
    });

    // Amount features (positions 40-49)
    if (amount > 0) {
      features[40] = Math.log10(amount + 1) / 10; // Log scaled amount
      features[41] = (amount % 100) / 100; // Last two digits
      features[42] = Math.floor(amount / 100) % 10 / 10; // Hundreds digit
      features[43] = Math.floor(amount / 1000) % 10 / 10; // Thousands digit
      features[44] = amount > 100 ? 1 : 0; // Over 100
      features[45] = amount > 1000 ? 1 : 0; // Over 1000
      features[46] = amount < 10 ? 1 : 0; // Under 10
      features[47] = amount < 50 ? 1 : 0; // Under 50
    }

    return features;
  }

  // Train TensorFlow ML model for a user
  async trainModel(userId) {
    try {
      const startTime = Date.now();

      // Get training data
      const trainingData = await CategoryTraining.getTrainingData(userId, 5000);

      if (trainingData.length < 10) {
        console.log(`Not enough training data for user ${userId}`);
        return false;
      }

      console.log(`Training TensorFlow model for user ${userId} with ${trainingData.length} samples`);

      // Prepare training data
      const inputs = [];
      const labels = [];

      trainingData.forEach(item => {
        const features = this.textToFeatures(item.description, item.amount);
        inputs.push(features);

        const output = new Array(7).fill(0);
        const categoryIndex = this.categories.indexOf(item.category);
        if (categoryIndex >= 0) {
          output[categoryIndex] = 1;
        }
        labels.push(output);
      });

      // Convert to tensors
      const xs = tf.tensor2d(inputs);
      const ys = tf.tensor2d(labels);

      // Create model
      const model = tf.sequential();
      model.add(tf.layers.dense({ inputShape: [50], units: 64, activation: 'relu' }));
      model.add(tf.layers.dropout({ rate: 0.2 }));
      model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
      model.add(tf.layers.dropout({ rate: 0.2 }));
      model.add(tf.layers.dense({ units: 7, activation: 'softmax' }));

      // Compile model
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });

      // Train model
      const history = await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}`);
            }
          }
        }
      });

      // Calculate accuracy
      const finalAccuracy = history.history.acc[history.history.acc.length - 1];

      // Save model to database
      const modelData = await model.save(tf.io.withSaveHandler(async (artifacts) => {
        return Buffer.from(JSON.stringify(artifacts));
      }));

      await CategoryModel.saveModel(userId, modelData, {
        layers: 3,
        inputSize: 50,
        outputSize: 7,
        trainingTime: Date.now() - startTime,
        epochs: 50,
        accuracy: finalAccuracy
      });

      // Store in memory for quick access
      this.models.set(userId.toString(), model);

      // Clean up tensors
      xs.dispose();
      ys.dispose();

      console.log(`TensorFlow model trained successfully for user ${userId} with ${finalAccuracy.toFixed(4)} accuracy`);
      return true;
    } catch (error) {
      console.error('Error training TensorFlow model:', error);
      return false;
    }
  }

  // Predict category using TensorFlow ML model
  async predictCategory(userId, description, amount = 0) {
    const userKey = userId.toString();

    // Check if we have a trained model in memory
    if (!this.models.has(userKey)) {
      // Try to load from database first
      const savedModel = await CategoryModel.getActiveModel(userId);
      if (savedModel) {
        try {
          // Load model from saved data
          const modelArtifacts = JSON.parse(savedModel.modelData.toString());
          const model = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
          this.models.set(userKey, model);
        } catch (error) {
          console.error('Error loading saved model:', error);
          // Fall back to training new model
          await this.trainModel(userId);
        }
      } else {
        // Train new model
        await this.trainModel(userId);
      }
    }

    const model = this.models.get(userKey);
    if (!model) {
      // Fallback to rule-based categorization
      return {
        category: this.categorize(description),
        confidence: 0.5,
        method: 'rule-based'
      };
    }

    try {
      const inputFeatures = this.textToFeatures(description, amount);
      const inputTensor = tf.tensor2d([inputFeatures]);
      const prediction = model.predict(inputTensor);
      const probabilities = await prediction.data();

      // Find the category with highest probability
      let maxProb = 0;
      let predictedIndex = 6; // default to 'other'

      probabilities.forEach((prob, index) => {
        if (prob > maxProb) {
          maxProb = prob;
          predictedIndex = index;
        }
      });

      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      return {
        category: this.categoryMap[predictedIndex],
        confidence: maxProb,
        method: 'tensorflow'
      };
    } catch (error) {
      console.error('Error predicting category with TensorFlow:', error);
      return {
        category: this.categorize(description),
        confidence: 0.5,
        method: 'rule-based-fallback'
      };
    }
  }

  // Suggest category with ML and fallback to patterns
  async suggestCategory(userId, description, amount = 0) {
    try {
      // First try ML prediction
      const mlResult = await this.predictCategory(userId, description, amount);

      // Get patterns for additional suggestions
      const patterns = await CategoryPattern.findPatternsForDescription(userId, description);

      const suggestions = [{
        category: mlResult.category,
        confidence: mlResult.confidence,
        method: mlResult.method
      }];

      // Add pattern-based suggestions
      patterns.slice(0, 2).forEach(pattern => {
        if (pattern.category !== mlResult.category) {
          suggestions.push({
            category: pattern.category,
            confidence: pattern.confidence * 0.8, // Slightly lower confidence
            method: 'pattern'
          });
        }
      });

      // Sort by confidence
      suggestions.sort((a, b) => b.confidence - a.confidence);

      return suggestions;
    } catch (error) {
      console.error('Error suggesting category:', error);
      return [{
        category: this.categorize(description),
        confidence: 0.5,
        method: 'fallback'
      }];
    }
  }

  // Train from user correction
  async trainFromCorrection(userId, description, suggestedCategory, actualCategory) {
    try {
      // Save training data
      const trainingData = new CategoryTraining({
        user: userId,
        description,
        category: actualCategory,
        source: 'user_correction'
      });
      await trainingData.save();

      // Update patterns
      await CategoryPattern.learnFromExpense(userId, description, actualCategory);

      // Retrain model in background (don't await)
      this.trainModel(userId).catch(err => console.error('Background training error:', err));

      return {
        message: 'Training data saved and model retraining initiated',
        trainingDataId: trainingData._id
      };
    } catch (error) {
      console.error('Error training from correction:', error);
      throw error;
    }
  }

  // Bulk categorize expenses
  async bulkCategorize(userId, expenses) {
    const results = [];

    for (const expense of expenses) {
      try {
        const suggestions = await this.suggestCategory(userId, expense.description, expense.amount);
        const bestSuggestion = suggestions[0];

        results.push({
          expenseId: expense._id,
          suggestedCategory: bestSuggestion.category,
          confidence: bestSuggestion.confidence,
          method: bestSuggestion.method,
          alternatives: suggestions.slice(1, 3)
        });
      } catch (error) {
        console.error(`Error categorizing expense ${expense._id}:`, error);
        results.push({
          expenseId: expense._id,
          suggestedCategory: this.categorize(expense.description),
          confidence: 0.5,
          method: 'fallback',
          error: error.message
        });
      }
    }

    return results;
  }

  // Get user statistics
  async getUserStats(userId) {
    try {
      const totalPatterns = await CategoryPattern.countDocuments({ user: userId, isActive: true });
      const totalTrainingData = await CategoryTraining.countDocuments({ user: userId });
      const hasModel = this.networks.has(userId.toString());

      return {
        totalPatterns,
        totalTrainingData,
        hasTrainedModel: hasModel,
        categories: this.categories
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        totalPatterns: 0,
        totalTrainingData: 0,
        hasTrainedModel: false,
        categories: this.categories
      };
    }
  }
}

module.exports = new CategorizationService();
