const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { validate, registerSchema, loginSchema } = require('../utils/validators');
const { verifyTokenMiddleware } = require('../middleware/auth.middleware');

/**
 * POST /api/auth/register
 * Register new user
 */
router.post('/register', validate(registerSchema), AuthController.register);

/**
 * POST /api/auth/login
 * User login with role-based response
 */
router.post('/login', validate(loginSchema), AuthController.login);

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', verifyTokenMiddleware, AuthController.logout);

module.exports = router;
