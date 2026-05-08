const pool = require('../config/database');
const logger = require('../config/logger');
const { hashPassword, verifyPassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const { v4: uuidv4 } = require('uuid');

class AuthController {
  /**
   * Register a new user
   */
  static async register(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { email, password, name, role } = req.validatedData;

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: 'User with this email already exists',
          status: 409
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Insert new user
      const result = await client.query(
        'INSERT INTO users (email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role',
        [email, hashedPassword, name, role, 'active']
      );

      const user = result.rows[0];

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      logger.info(`User registered successfully: ${email}`);

      res.status(201).json({
        message: 'User registered successfully',
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          token
        }
      });
    } catch (error) {
      logger.error('Registration error', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Login user
   */
  static async login(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { email, password } = req.validatedData;

      // Find user by email
      const result = await client.query(
        'SELECT id, email, name, password_hash, role, status FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid email or password',
          status: 401
        });
      }

      const user = result.rows[0];

      // Verify password
      const isPasswordValid = await verifyPassword(password, user.password_hash);

      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'Invalid email or password',
          status: 401
        });
      }

      if (user.status !== 'active') {
        return res.status(403).json({
          error: 'User account is inactive',
          status: 403
        });
      }

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      logger.info(`User logged in: ${email}`);

      res.json({
        message: 'Login successful',
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          token
        }
      });
    } catch (error) {
      logger.error('Login error', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Logout user (invalidate token on client side)
   */
  static async logout(req, res, next) {
    try {
      logger.info(`User logged out: ${req.user.email}`);
      res.json({
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout error', error);
      next(error);
    }
  }
}

module.exports = AuthController;
