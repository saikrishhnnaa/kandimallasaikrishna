const pool = require('../config/database');
const logger = require('../config/logger');

class AnalyticsController {
  /**
   * Get dashboard metrics
   */
  static async getDashboard(req, res, next) {
    const client = await pool.connect();
    
    try {
      // Total sales
      const salesResult = await client.query(
        'SELECT COUNT(*) as total_orders, SUM(net_amount) as total_revenue, AVG(net_amount) as average_order_value FROM orders WHERE order_status IN (\'confirmed\', \'processing\', \'shipped\', \'delivered\')'
      );

      // Top products
      const topProductsResult = await client.query(
        'SELECT p.id, p.name, SUM(oi.quantity) as units_sold, SUM(oi.line_total) as revenue FROM order_items oi JOIN products p ON oi.product_id = p.id GROUP BY p.id, p.name ORDER BY units_sold DESC LIMIT 5'
      );

      // Sales by agent
      const salesByAgentResult = await client.query(
        'SELECT u.id, u.name, COUNT(o.id) as orders_count, SUM(o.net_amount) as total_sales FROM orders o JOIN users u ON o.agent_id = u.id WHERE u.role = \'sales_agent\' GROUP BY u.id, u.name ORDER BY total_sales DESC'
      );

      // Inventory status
      const inventoryResult = await client.query(
        'SELECT COUNT(*) as total_products, SUM(stock_quantity) as total_stock_value, COUNT(CASE WHEN stock_quantity <= min_stock_level THEN 1 END) as low_stock_items FROM products WHERE status = \'active\''
      );

      res.json({
        message: 'Dashboard metrics retrieved successfully',
        data: {
          sales: {
            total_orders: parseInt(salesResult.rows[0].total_orders),
            total_revenue: parseFloat(salesResult.rows[0].total_revenue || 0),
            average_order_value: parseFloat(salesResult.rows[0].average_order_value || 0)
          },
          top_products: topProductsResult.rows,
          sales_by_agent: salesByAgentResult.rows,
          inventory: inventoryResult.rows[0]
        }
      });
    } catch (error) {
      logger.error('Error fetching dashboard metrics', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get sales analytics
   */
  static async getSalesAnalytics(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { start_date, end_date, agent_id, product_id } = req.query;

      let query = 'SELECT DATE(o.order_date) as date, COUNT(o.id) as orders, SUM(o.net_amount) as revenue FROM orders o WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (start_date) {
        query += ` AND o.order_date >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }

      if (end_date) {
        query += ` AND o.order_date <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }

      if (agent_id) {
        query += ` AND o.agent_id = $${paramCount}`;
        params.push(agent_id);
        paramCount++;
      }

      query += ' GROUP BY DATE(o.order_date) ORDER BY date DESC';

      const result = await client.query(query, params);

      res.json({
        message: 'Sales analytics retrieved successfully',
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching sales analytics', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get inventory analytics
   */
  static async getInventoryAnalytics(req, res, next) {
    const client = await pool.connect();
    
    try {
      // Low stock items
      const lowStockResult = await client.query(
        'SELECT id, name, sku, stock_quantity, min_stock_level FROM products WHERE stock_quantity <= min_stock_level AND status = \'active\''
      );

      // Stock value
      const stockValueResult = await client.query(
        'SELECT SUM(stock_quantity * cost_price) as total_stock_value FROM products WHERE status = \'active\''
      );

      // Category distribution
      const categoryResult = await client.query(
        'SELECT category, COUNT(*) as product_count, SUM(stock_quantity) as total_stock FROM products WHERE status = \'active\' GROUP BY category'
      );

      res.json({
        message: 'Inventory analytics retrieved successfully',
        data: {
          low_stock_items: lowStockResult.rows,
          stock_value: parseFloat(stockValueResult.rows[0].total_stock_value || 0),
          category_distribution: categoryResult.rows
        }
      });
    } catch (error) {
      logger.error('Error fetching inventory analytics', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get commission tracking
   */
  static async getCommissionTracking(req, res, next) {
    const client = await pool.connect();
    
    try {
      const { period, agent_id } = req.query;

      let query = 'SELECT u.id, u.name, SUM(c.commission_amount) as total_commission, COUNT(c.id) as commission_entries, c.status FROM commissions c JOIN users u ON c.agent_id = u.id WHERE u.role = \'sales_agent\' AND 1=1';
      const params = [];
      let paramCount = 1;

      if (period) {
        const [year, month] = period.split('-');
        query += ` AND c.period_year = $${paramCount} AND c.period_month = $${paramCount + 1}`;
        params.push(parseInt(year), parseInt(month));
        paramCount += 2;
      }

      if (agent_id) {
        query += ` AND c.agent_id = $${paramCount}`;
        params.push(agent_id);
        paramCount++;
      }

      query += ' GROUP BY u.id, u.name, c.status';

      const result = await client.query(query, params);

      res.json({
        message: 'Commission tracking retrieved successfully',
        data: result.rows
      });
    } catch (error) {
      logger.error('Error fetching commission tracking', error);
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = AnalyticsController;
