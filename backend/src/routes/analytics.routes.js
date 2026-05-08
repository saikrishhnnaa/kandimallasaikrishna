const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analytics.controller');
const { verifyTokenMiddleware, authorize } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyTokenMiddleware);

/**
 * GET /api/analytics/dashboard
 * Get dashboard metrics (Admin/Manager)
 */
router.get('/dashboard', authorize('admin'), AnalyticsController.getDashboard);

/**
 * GET /api/analytics/sales
 * Sales analytics report
 */
router.get('/sales', authorize('admin', 'employee'), AnalyticsController.getSalesAnalytics);

/**
 * GET /api/analytics/inventory
 * Inventory analytics
 */
router.get('/inventory', authorize('admin', 'employee'), AnalyticsController.getInventoryAnalytics);

/**
 * GET /api/analytics/commission
 * Commission tracking (Admin)
 */
router.get('/commission', authorize('admin'), AnalyticsController.getCommissionTracking);

module.exports = router;
