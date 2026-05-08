const pool = require('../config/database');
const logger = require('../config/logger');

class InventoryController {
  /**
   * Get all products
   */
  static async getAllProducts(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { category, status, low_stock, search, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT id, name, sku, category, price, stock_quantity, min_stock_level, status, created_at FROM products WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (category) {
        query += ` AND category = $${paramCount}`;
        params.push(category);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (low_stock === 'true') {
        query += ` AND stock_quantity <= min_stock_level`;
      }

      if (search) {
        query += ` AND (name ILIKE $${paramCount} OR sku ILIKE $${paramCount})`;
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
        message: 'Products retrieved successfully',
        data: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching products', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get product by ID
   */
  static async getProductById(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;

      const result = await client.query(
        'SELECT id, name, sku, category, description, price, cost_price, stock_quantity, min_stock_level, max_stock_level, unit_of_measurement, status, created_at FROM products WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Product not found',
          status: 404
        });
      }

      res.json({
        message: 'Product retrieved successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error fetching product', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Create new product
   */
  static async createProduct(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { name, sku, category, description, price, cost_price, stock_quantity, min_stock_level, max_stock_level, unit_of_measurement } = req.validatedData;

      // Check if SKU already exists
      const existing = await client.query(
        'SELECT id FROM products WHERE sku = $1',
        [sku]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Product with this SKU already exists',
          status: 409
        });
      }

      const result = await client.query(
        'INSERT INTO products (name, sku, category, description, price, cost_price, stock_quantity, min_stock_level, max_stock_level, unit_of_measurement, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, name, sku, category, price, stock_quantity, created_at',
        [name, sku, category, description || null, price, cost_price || null, stock_quantity, min_stock_level || 10, max_stock_level || 1000, unit_of_measurement || 'piece', 'active']
      );

      logger.info(`Product created: ${sku}`);

      res.status(201).json({
        message: 'Product created successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error creating product', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update product
   */
  static async updateProduct(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const updateData = req.validatedData;

      const existing = await client.query(
        'SELECT id FROM products WHERE id = $1',
        [id]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          error: 'Product not found',
          status: 404
        });
      }

      let query = 'UPDATE products SET ';
      const params = [];
      let paramCount = 1;

      Object.keys(updateData).forEach((key, index) => {
        if (index > 0) query += ', ';
        query += `${key} = $${paramCount}`;
        params.push(updateData[key]);
        paramCount++;
      });

      query += `, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING id, name, sku, category, price, stock_quantity`;
      params.push(id);

      const result = await client.query(query, params);

      logger.info(`Product updated: ${id}`);

      res.json({
        message: 'Product updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating product', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Adjust product stock
   */
  static async adjustStock(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const { quantity, type, notes } = req.validatedData;

      await client.query('BEGIN');

      const product = await client.query(
        'SELECT id, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (product.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          error: 'Product not found',
          status: 404
        });
      }

      const currentStock = product.rows[0].stock_quantity;
      const newStock = currentStock + (type === 'sale' || type === 'return' && quantity < 0 ? -quantity : quantity);

      if (newStock < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Insufficient stock for this transaction',
          status: 400
        });
      }

      // Update product stock
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStock, id]
      );

      // Log transaction
      await client.query(
        'INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference_type, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, type, quantity, 'manual', notes || '', req.user.id]
      );

      await client.query('COMMIT');

      logger.info(`Stock adjusted for product ${id}: ${type} of ${quantity} units`);

      res.json({
        message: 'Stock adjusted successfully',
        data: {
          product_id: id,
          previous_stock: currentStock,
          quantity_adjusted: quantity,
          new_stock: newStock,
          type
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adjusting stock', error);
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = InventoryController;
