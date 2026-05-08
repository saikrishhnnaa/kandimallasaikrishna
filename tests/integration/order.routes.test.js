const request = require('supertest');
const pool = require('../../../src/config/database');
const { generateToken } = require('../../../src/utils/jwt');

jest.mock('../../../src/config/database');
const app = require('../../../src/index');

describe('Order Routes Integration', () => {
  let mockClient;
  const adminToken = generateToken({ id: 1, email: 'admin@example.com', role: 'admin' });
  const agentToken = generateToken({ id: 3, email: 'agent@example.com', role: 'sales_agent' });

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('GET /api/orders', () => {
    it('should return orders for sales agent filtered by agent_id', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, order_number: 'ORD-001', customer_id: 1, order_status: 'pending' }
          ]
        });

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('POST /api/orders', () => {
    it('should create order for sales agent', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            order_number: 'ORD-1234',
            customer_id: 1,
            total_amount: 2500,
            net_amount: 2400
          }]
        })
        .mockResolvedValueOnce(undefined) // INSERT item
        .mockResolvedValueOnce(undefined) // UPDATE stock
        .mockResolvedValueOnce(undefined) // INSERT transaction
        .mockResolvedValueOnce(undefined) // INSERT activity
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          customer_id: 1,
          items: [
            { product_id: 1, quantity: 5, unit_price: 500 }
          ],
          discount_amount: 0,
          payment_method: 'cash'
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('order_number');
    });
  });

  describe('POST /api/orders/:id/payment', () => {
    it('should process payment successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, net_amount: 2400, payment_status: 'pending' }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            payment_amount: 2400,
            transaction_status: 'success'
          }]
        })
        .mockResolvedValueOnce(undefined) // UPDATE order
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/orders/1/payment')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          payment_amount: 2400,
          payment_method: 'cash',
          payment_reference: ''
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('order_payment_status', 'paid');
    });
  });
});
