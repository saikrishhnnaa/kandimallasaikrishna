const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const { validate, createUserSchema, updateUserSchema } = require('../utils/validators');
const { verifyTokenMiddleware, authorize } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(verifyTokenMiddleware);

/**
 * GET /api/users
 * List all users (Admin only)
 */
router.get('/', authorize('admin'), UserController.getAllUsers);

/**
 * GET /api/users/:id
 * Get user details
 */
router.get('/:id', UserController.getUserById);

/**
 * POST /api/users
 * Create new user (Admin only)
 */
router.post('/', authorize('admin'), validate(createUserSchema), UserController.createUser);

/**
 * PUT /api/users/:id
 * Update user details
 */
router.put('/:id', validate(updateUserSchema), UserController.updateUser);

/**
 * DELETE /api/users/:id
 * Delete user (Admin only)
 */
router.delete('/:id', authorize('admin'), UserController.deleteUser);

module.exports = router;
