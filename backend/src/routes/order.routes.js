const express = require('express');
const router = express.Router();

// Order management routes

/**
 * GET /api/orders
 * List orders (filtered by role)
 */
router.get('/', (req, res) => {
  res.json({
    message: 'List orders',
    filters: ['status', 'agent_id', 'date_range', 'customer']
  });
});

/**
 * GET /api/orders/:id
 * Get order details
 */
router.get('/:id', (req, res) => {
  res.json({ message: `Get order ${req.params.id}` });
});

/**
 * POST /api/orders
 * Create new order (Sales Agent/Employee)
 */
router.post('/', (req, res) => {
  res.status(201).json({
    message: 'Create new order',
    required_fields: ['customer_id', 'items', 'payment_method']
  });
});

/**
 * PUT /api/orders/:id
 * Update order status
 */
router.put('/:id', (req, res) => {
  res.json({ message: `Update order ${req.params.id}` });
});

/**
 * POST /api/orders/:id/payment
 * Process payment
 */
router.post('/:id/payment', (req, res) => {
  res.json({
    message: `Process payment for order ${req.params.id}`,
    payment_methods: ['cash', 'card', 'digital_wallet', 'check']
  });
});

module.exports = router;
