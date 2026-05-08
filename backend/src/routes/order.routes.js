const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order.controller');
const { validate, createOrderSchema, updateOrderStatusSchema, processPaymentSchema } = require('../utils/validators');
const { verifyTokenMiddleware, authorize } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyTokenMiddleware);

/**
 * GET /api/orders
 * List orders (filtered by role)
 */
router.get('/', OrderController.getAllOrders);

/**
 * GET /api/orders/:id
 * Get order details
 */
router.get('/:id', OrderController.getOrderById);

/**
 * POST /api/orders
 * Create new order (Sales Agent/Employee)
 */
router.post('/', authorize('sales_agent', 'employee'), validate(createOrderSchema), OrderController.createOrder);

/**
 * PUT /api/orders/:id
 * Update order status
 */
router.put('/:id', authorize('admin', 'employee'), validate(updateOrderStatusSchema), OrderController.updateOrderStatus);

/**
 * POST /api/orders/:id/payment
 * Process payment
 */
router.post('/:id/payment', authorize('admin', 'employee', 'sales_agent'), validate(processPaymentSchema), OrderController.processPayment);

module.exports = router;
