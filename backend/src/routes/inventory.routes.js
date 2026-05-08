const express = require('express');
const router = express.Router();
const InventoryController = require('../controllers/inventory.controller');
const { validate, createProductSchema, updateProductSchema, stockAdjustmentSchema } = require('../utils/validators');
const { verifyTokenMiddleware, authorize } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyTokenMiddleware);

/**
 * GET /api/inventory
 * List all products
 */
router.get('/', InventoryController.getAllProducts);

/**
 * GET /api/inventory/:id
 * Get product details
 */
router.get('/:id', InventoryController.getProductById);

/**
 * POST /api/inventory
 * Add new product (Admin/Employee)
 */
router.post('/', authorize('admin', 'employee'), validate(createProductSchema), InventoryController.createProduct);

/**
 * PUT /api/inventory/:id
 * Update product
 */
router.put('/:id', authorize('admin', 'employee'), validate(updateProductSchema), InventoryController.updateProduct);

/**
 * POST /api/inventory/:id/stock-adjustment
 * Adjust stock levels
 */
router.post('/:id/stock-adjustment', authorize('admin', 'employee'), validate(stockAdjustmentSchema), InventoryController.adjustStock);

module.exports = router;
