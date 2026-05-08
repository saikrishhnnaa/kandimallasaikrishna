const pool = require('../config/database');
const logger = require('../config/logger');
const { hashPassword } = require('../utils/password');

class UserController {
  /**
   * Get all users (Admin only)
   */
  static async getAllUsers(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { role, status, search, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT id, email, name, role, status, phone, department, created_at FROM users WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (role) {
        query += ` AND role = $${paramCount}`;
        params.push(role);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (search) {
        query += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Get total count
      const countQuery = query.replace(/SELECT .* FROM/i, 'SELECT COUNT(*) FROM');
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await client.query(query, params);

      res.json({
        message: 'Users retrieved successfully',
        data: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching users', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;

      const result = await client.query(
        'SELECT id, email, name, role, status, phone, department, commission_rate, created_at FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          status: 404
        });
      }

      res.json({
        message: 'User retrieved successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error fetching user', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Create new user (Admin only)
   */
  static async createUser(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { email, password, name, role, phone, department } = req.validatedData;

      // Check if user already exists
      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'User with this email already exists',
          status: 409
        });
      }

      const hashedPassword = await hashPassword(password);

      const result = await client.query(
        'INSERT INTO users (email, password_hash, name, role, status, phone, department) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, name, role, status',
        [email, hashedPassword, name, role, 'active', phone, department]
      );

      logger.info(`User created: ${email} with role ${role}`);

      res.status(201).json({
        message: 'User created successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error creating user', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update user
   */
  static async updateUser(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const updateData = req.validatedData;

      // Check if user exists
      const existing = await client.query(
        'SELECT id FROM users WHERE id = $1',
        [id]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          status: 404
        });
      }

      // Build dynamic update query
      let query = 'UPDATE users SET ';
      const params = [];
      let paramCount = 1;

      Object.keys(updateData).forEach((key, index) => {
        if (index > 0) query += ', ';
        query += `${key} = $${paramCount}`;
        params.push(updateData[key]);
        paramCount++;
      });

      query += ` WHERE id = $${paramCount} RETURNING id, email, name, role, status, phone, department`;
      params.push(id);

      const result = await client.query(query, params);

      logger.info(`User updated: ${id}`);

      res.json({
        message: 'User updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating user', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete user (Admin only)
   */
  static async deleteUser(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;

      const result = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email, name',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          status: 404
        });
      }

      logger.info(`User deleted: ${id}`);

      res.json({
        message: 'User deleted successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error deleting user', error);
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = UserController;
