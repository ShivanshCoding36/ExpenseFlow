const express = require('express');
const auth = require('../middleware/auth');
const Budget = require('../models/Budget');
const budgetService = require('../services/budgetService');
const { BudgetSchemas, validateRequest, validateQuery } = require('../middleware/inputValidator');
const { budgetLimiter } = require('../middleware/rateLimiter');
const ResponseFactory = require('../utils/ResponseFactory');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { NotFoundError } = require('../utils/AppError');
const router = express.Router();

// Create budget
router.post('/', auth, budgetLimiter, validateRequest(BudgetSchemas.create), asyncHandler(async (req, res) => {
  const budget = new Budget({ ...req.body, user: req.user._id });
  await budget.save();

  return ResponseFactory.created(res, budget, 'Budget created successfully');
}));

// Get all budgets
router.get('/', auth, validateQuery(BudgetSchemas.create), asyncHandler(async (req, res) => {
  const { period, active } = req.query;
  const query = { user: req.user._id };

  if (period) query.period = period;
  if (active !== undefined) query.isActive = active === 'true';

  const budgets = await Budget.find(query).sort({ createdAt: -1 });

  // Calculate spent amounts
  for (const budget of budgets) {
    await budgetService.calculateBudgetSpent(budget);
  }

  return ResponseFactory.success(res, budgets);
}));

// Get budget summary
router.get('/summary', auth, asyncHandler(async (req, res) => {
  const { period = 'monthly' } = req.query;
  const summary = await budgetService.getBudgetSummary(req.user._id, period);

  return ResponseFactory.success(res, summary);
}));

// Get budget alerts
router.get('/alerts', auth, asyncHandler(async (req, res) => {
  const alerts = await budgetService.checkBudgetAlerts(req.user._id);

  return ResponseFactory.success(res, alerts);
}));

// Update budget
router.put('/:id', auth, validateRequest(BudgetSchemas.create), asyncHandler(async (req, res) => {
  const budget = await Budget.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true }
  );

  if (!budget) throw new NotFoundError('Budget not found');

  return ResponseFactory.success(res, budget, 'Budget updated successfully');
}));

// Delete budget
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!budget) throw new NotFoundError('Budget not found');

  return ResponseFactory.success(res, null, 'Budget deleted successfully');
}));

// Create monthly budgets
router.post('/monthly', auth, validateRequest(BudgetSchemas.monthly), asyncHandler(async (req, res) => {
  const budgets = await budgetService.createMonthlyBudgets(req.user._id, req.body);

  return ResponseFactory.created(res, budgets, 'Monthly budgets created successfully');
}));

// Set monthly budget limit
router.post('/monthly-limit', auth, validateRequest(BudgetSchemas.limit), asyncHandler(async (req, res) => {
  const { limit } = req.body;

  const User = require('../models/User');
  await User.findByIdAndUpdate(req.user._id, { monthlyBudgetLimit: limit });

  return ResponseFactory.success(res, { limit }, 'Monthly budget limit updated successfully');
}));

// Get monthly budget limit and status
router.get('/monthly-limit', auth, asyncHandler(async (req, res) => {
  const User = require('../models/User');
  const Expense = require('../models/Expense');

  const user = await User.findById(req.user._id);
  if (!user) throw new NotFoundError('User not found');

  // Calculate current month's expenses
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthlyExpenses = await Expense.aggregate([
    {
      $match: {
        user: req.user._id,
        type: 'expense',
        date: { $gte: startOfMonth, $lte: endOfMonth }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);

  const totalSpent = monthlyExpenses.length > 0 ? monthlyExpenses[0].total : 0;
  const limit = user.monthlyBudgetLimit || 0;
  const remaining = limit - totalSpent;
  const percentage = limit > 0 ? (totalSpent / limit) * 100 : 0;
  const isExceeded = totalSpent > limit && limit > 0;
  const isNearLimit = percentage >= 80 && !isExceeded;

  return ResponseFactory.success(res, {
    limit,
    totalSpent,
    remaining: Math.max(0, remaining),
    percentage: Math.min(100, percentage),
    isExceeded,
    isNearLimit,
    daysInMonth: endOfMonth.getDate(),
    currentDay: now.getDate()
  });
}));

module.exports = router;