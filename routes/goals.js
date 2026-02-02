const express = require('express');
const auth = require('../middleware/auth');
const Goal = require('../models/Goal');
const goalService = require('../services/goalService');
const { GoalSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const { goalLimiter } = require('../middleware/rateLimiter');
const ResponseFactory = require('../utils/ResponseFactory');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { NotFoundError, BadRequestError } = require('../utils/AppError');
const router = express.Router();

/**
 * @route   GET /api/goals
 * @desc    Get all goals for user
 * @access  Private
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 });
  return ResponseFactory.success(res, goals);
}));

/**
 * @route   POST /api/goals
 * @desc    Create a new goal
 * @access  Private
 */
router.post('/', auth, goalLimiter, validateRequest(GoalSchemas.create), asyncHandler(async (req, res) => {
  const goal = new Goal({ ...req.body, user: req.user._id });

  // Add default milestones if not provided
  if (!goal.milestones || goal.milestones.length === 0) {
    goal.milestones = [
      { percentage: 25 },
      { percentage: 50 },
      { percentage: 75 },
      { percentage: 100 }
    ];
  }

  await goal.save();
  return ResponseFactory.created(res, goal, 'Goal created successfully');
}));

/**
 * @route   GET /api/goals/analyze/impact
 * @desc    Analyze impact of a potential large expense on all goals
 * @access  Private
 */
router.get('/analyze/impact', auth, asyncHandler(async (req, res) => {
  const { amount } = req.query;
  if (!amount || isNaN(amount)) {
    throw new BadRequestError('Valid amount is required');
  }

  const impacts = await goalService.analyzeExpenseImpact(req.user._id, parseFloat(amount));
  return ResponseFactory.success(res, impacts);
}));

/**
 * @route   GET /api/goals/:id
 * @desc    Get specific goal with prediction
 * @access  Private
 */
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
  if (!goal) throw new NotFoundError('Goal not found');

  const prediction = await goalService.predictCompletion(goal._id, req.user._id);

  return ResponseFactory.success(res, {
    ...goal.toJSON(),
    prediction
  });
}));

/**
 * @route   PUT /api/goals/:id
 * @desc    Update a goal
 * @access  Private
 */
router.put('/:id', auth, asyncHandler(async (req, res) => {
  const goal = await Goal.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true }
  );

  if (!goal) throw new NotFoundError('Goal not found');
  return ResponseFactory.success(res, goal, 'Goal updated successfully');
}));

/**
 * @route   DELETE /api/goals/:id
 * @desc    Delete a goal
 * @access  Private
 */
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!goal) throw new NotFoundError('Goal not found');

  return ResponseFactory.success(res, null, 'Goal deleted successfully');
}));

/**
 * @route   POST /api/goals/:id/contribute
 * @desc    Add contribution to a goal
 * @access  Private
 */
router.post('/:id/contribute', auth, asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    throw new BadRequestError('Valid amount is required');
  }

  const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
  if (!goal) throw new NotFoundError('Goal not found');

  goal.currentAmount += parseFloat(amount);
  goal.contributions.push({
    amount: parseFloat(amount),
    date: new Date()
  });

  await goal.save();
  return ResponseFactory.success(res, goal, 'Contribution added successfully');
}));

module.exports = router;