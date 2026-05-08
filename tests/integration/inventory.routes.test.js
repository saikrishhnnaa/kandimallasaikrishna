const request = require('supertest');
const pool = require('../../../src/config/database');
const { generateToken } = require('../../../src/utils/jwt');

jest.mock('../../../src/config/database');
const app = require('../../../src/index');

describe('Inventory Routes Integration', () => {
  let mockClient;
  const adminToken = generateToken({ id: 1, email: 'admin@example.com', role: 'admin' });
  const employeeToken = generateToken({ id: 2, email: 'emp@example.com', role: 'employee' });
  const agentToken = generateToken({ id: 3, email: 'agent@example.com', role: 'sales_agent' });

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('GET /api/inventory', () => {
    it('should return products list', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Widget A', sku: 'SKU001', price: 500, stock_quantity: 100 }
          ]
        });

      const response = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('POST /api/inventory', () => {
    it('should create product for admin', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check SKU
        .mockResolvedValueOnce({
          rows: [{
            id: 5,
            name: 'New Product',
            sku: 'NEW-001',
            price: 599.99,
            stock_quantity: 100
          }]
        });

      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Product',
          sku: 'NEW-001',
          category: 'Electronics',
          price: 599.99,
          cost_price: 350,
          stock_quantity: 100
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('name', 'New Product');
    });

    it('should return 403 for sales_agent', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          name: 'Product',
          sku: 'SKU-001',
          category: 'Electronics',
          price: 500,
          stock_quantity: 100
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/inventory/:id/stock-adjustment', () => {
    it('should adjust stock for employee', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 1, stock_quantity: 100 }]
        })
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined) // INSERT transaction
        .mockResolvedValueOnce(undefined); // COMMIT

      const response = await request(app)
        .post('/api/inventory/1/stock-adjustment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          quantity: 50,
          type: 'purchase',
          notes: 'Stock received'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('new_stock', 150);
    });
  });
});
