const pool = require('../../../src/config/database');

describe('OrderController', () => {
  let mockClient;
  const OrderController = require('../../../src/controllers/order.controller');

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('getAllOrders', () => {
    it('should return paginated list of orders', async () => {
      const req = {
        query: { page: 1, limit: 10 },
        user: { role: 'admin', id: 1 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '20' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, order_number: 'ORD-001', customer_id: 1, order_status: 'pending' }
          ]
        });

      await OrderController.getAllOrders(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Orders retrieved successfully',
          data: expect.any(Array),
          pagination: expect.objectContaining({
            total: 20,
            page: 1
          })
        })
      );
    });

    it('should filter orders by agent for sales_agent role', async () => {
      const req = {
        query: { page: 1, limit: 10 },
        user: { role: 'sales_agent', id: 5 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await OrderController.getAllOrders(req, res, next);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('agent_id = $1'),
        expect.arrayContaining([5])
      );
    });
  });

  describe('getOrderById', () => {
    it('should return order with items by id', async () => {
      const req = { params: { id: 1 } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            order_number: 'ORD-001',
            customer_id: 1,
            total_amount: 2500,
            net_amount: 2400
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, product_id: 1, quantity: 5, unit_price: 500, line_total: 2500 }
          ]
        });

      await OrderController.getOrderById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order retrieved successfully',
          data: expect.objectContaining({
            id: 1,
            order_number: 'ORD-001',
            items: expect.any(Array)
          })
        })
      );
    });

    it('should return 404 if order not found', async () => {
      const req = { params: { id: 999 } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await OrderController.getOrderById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createOrder', () => {
    it('should create order with items and update inventory', async () => {
      const req = {
        validatedData: {
          customer_id: 1,
          items: [
            { product_id: 1, quantity: 5, unit_price: 500 }
          ],
          discount_amount: 100,
          tax_amount: 50,
          payment_method: 'cash',
          notes: 'Test order'
        },
        user: { id: 1 }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            order_number: 'ORD-1234',
            customer_id: 1,
            agent_id: 1,
            total_amount: 2500,
            net_amount: 2450
          }]
        })
        .mockResolvedValueOnce(undefined) // INSERT order items
        .mockResolvedValueOnce(undefined) // UPDATE product stock
        .mockResolvedValueOnce(undefined) // INSERT inventory transaction
        .mockResolvedValueOnce(undefined) // INSERT activity log
        .mockResolvedValueOnce(undefined); // COMMIT

      await OrderController.createOrder(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order created successfully',
          data: expect.objectContaining({
            order_number: expect.stringMatching(/^ORD-/),
            total_amount: 2500
          })
        })
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status', async () => {
      const req = {
        params: { id: 1 },
        validatedData: { status: 'confirmed' }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          order_number: 'ORD-001',
          order_status: 'confirmed'
        }]
      });

      await OrderController.updateOrderStatus(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order status updated successfully',
          data: expect.objectContaining({
            order_status: 'confirmed'
          })
        })
      );
    });
  });

  describe('processPayment', () => {
    it('should process payment and update payment status', async () => {
      const req = {
        params: { id: 1 },
        validatedData: {
          payment_amount: 2400,
          payment_method: 'cash',
          payment_reference: ''
        },
        user: { id: 1 }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, net_amount: 2400, payment_status: 'pending' }]
        }) // SELECT order
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            payment_amount: 2400,
            transaction_status: 'success'
          }]
        }) // INSERT payment
        .mockResolvedValueOnce(undefined) // UPDATE order payment status
        .mockResolvedValueOnce(undefined); // COMMIT

      await OrderController.processPayment(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Payment processed successfully',
          data: expect.objectContaining({
            payment: expect.any(Object),
            order_payment_status: 'paid'
          })
        })
      );
    });
  });
});
