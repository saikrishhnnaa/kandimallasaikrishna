const pool = require('../config/database');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

class OrderController {
  /**
   * Get all orders
   */
  static async getAllOrders(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { status, agent_id, start_date, end_date, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT id, order_number, customer_id, agent_id, order_date, total_amount, net_amount, order_status, payment_status FROM orders WHERE 1=1';
      const params = [];
      let paramCount = 1;

      // Filter by role
      if (req.user.role === 'sales_agent') {
        query += ` AND agent_id = $${paramCount}`;
        params.push(req.user.id);
        paramCount++;
      } else if (agent_id) {
        query += ` AND agent_id = $${paramCount}`;
        params.push(agent_id);
        paramCount++;
      }

      if (status) {
        query += ` AND order_status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (start_date) {
        query += ` AND order_date >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }

      if (end_date) {
        query += ` AND order_date <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }

      // Get total count
      const countQuery = query.replace(/SELECT .* FROM/i, 'SELECT COUNT(*) FROM');
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      query += ` ORDER BY order_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await client.query(query, params);

      res.json({
        message: 'Orders retrieved successfully',
        data: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching orders', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get order by ID
   */
  static async getOrderById(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;

      const order = await client.query(
        'SELECT id, order_number, customer_id, agent_id, order_date, total_amount, discount_amount, tax_amount, net_amount, payment_method, payment_status, order_status, notes FROM orders WHERE id = $1',
        [id]
      );

      if (order.rows.length === 0) {
        return res.status(404).json({
          error: 'Order not found',
          status: 404
        });
      }

      const items = await client.query(
        'SELECT id, product_id, quantity, unit_price, line_total FROM order_items WHERE order_id = $1',
        [id]
      );

      res.json({
        message: 'Order retrieved successfully',
        data: {
          ...order.rows[0],
          items: items.rows
        }
      });
    } catch (error) {
      logger.error('Error fetching order', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Create new order
   */
  static async createOrder(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { customer_id, items, discount_amount = 0, tax_amount = 0, payment_method, notes } = req.validatedData;

      await client.query('BEGIN');

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${uuidv4().substring(0, 8)}`;

      // Calculate totals
      let totalAmount = 0;
      for (const item of items) {
        totalAmount += item.unit_price * item.quantity;
      }

      const netAmount = totalAmount - discount_amount + tax_amount;

      // Create order
      const orderResult = await client.query(
        'INSERT INTO orders (order_number, customer_id, agent_id, total_amount, discount_amount, tax_amount, net_amount, payment_method, order_status, payment_status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, order_number, customer_id, agent_id, total_amount, net_amount',
        [orderNumber, customer_id, req.user.id, totalAmount, discount_amount, tax_amount, netAmount, payment_method, 'pending', 'pending', notes || '']
      );

      const orderId = orderResult.rows[0].id;

      // Insert order items
      for (const item of items) {
        const lineTotal = item.unit_price * item.quantity;
        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5)',
          [orderId, item.product_id, item.quantity, item.unit_price, lineTotal]
        );

        // Update product stock
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );

        // Log inventory transaction
        await client.query(
          'INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference_id, reference_type, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
          [item.product_id, 'sale', item.quantity, orderId, 'order', req.user.id]
        );
      }

      // Log activity
      await client.query(
        'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, new_values) VALUES ($1, $2, $3, $4, $5)',
        [req.user.id, 'create_order', 'order', orderId, JSON.stringify(orderResult.rows[0])]
      );

      await client.query('COMMIT');

      logger.info(`Order created: ${orderNumber} for customer ${customer_id}`);

      res.status(201).json({
        message: 'Order created successfully',
        data: {
          ...orderResult.rows[0],
          items: items
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating order', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update order status
   */
  static async updateOrderStatus(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const { status } = req.validatedData;

      const result = await client.query(
        'UPDATE orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, order_number, order_status',
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Order not found',
          status: 404
        });
      }

      logger.info(`Order status updated: ${id} -> ${status}`);

      res.json({
        message: 'Order status updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating order status', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Process payment for order
   */
  static async processPayment(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const { payment_amount, payment_method, payment_reference } = req.validatedData;

      await client.query('BEGIN');

      // Check order exists
      const order = await client.query(
        'SELECT id, net_amount, payment_status FROM orders WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (order.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          error: 'Order not found',
          status: 404
        });
      }

      const orderData = order.rows[0];

      // Insert payment record
      const paymentResult = await client.query(
        'INSERT INTO payments (order_id, payment_amount, payment_method, payment_reference, transaction_status, processed_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, payment_amount, transaction_status',
        [id, payment_amount, payment_method, payment_reference || '', 'success', req.user.id]
      );

      // Update payment status
      let newPaymentStatus = 'partial';
      if (payment_amount >= orderData.net_amount) {
        newPaymentStatus = 'paid';
      }

      await client.query(
        'UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPaymentStatus, id]
      );

      await client.query('COMMIT');

      logger.info(`Payment processed for order ${id}: ${payment_amount}`);

      res.json({
        message: 'Payment processed successfully',
        data: {
          payment: paymentResult.rows[0],
          order_payment_status: newPaymentStatus
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing payment', error);
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = OrderController;
