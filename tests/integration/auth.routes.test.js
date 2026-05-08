const request = require('supertest');
const pool = require('../../../src/config/database');
const { generateToken } = require('../../../src/utils/jwt');

jest.mock('../../../src/config/database');
const app = require('../../../src/index');

describe('Auth Routes Integration', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register new user and return token', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check user exists
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            email: 'newuser@example.com',
            name: 'New User',
            role: 'sales_agent'
          }]
        });

      const bcrypt = require('bcryptjs');
      bcrypt.hash = jest.fn().mockResolvedValue('hashed');

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123',
          name: 'New User',
          role: 'sales_agent'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data.token');
      expect(response.body.data).toHaveProperty('email', 'newuser@example.com');
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'SecurePass123',
          name: 'User',
          role: 'sales_agent'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user and return token', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'user@example.com',
          name: 'Test User',
          password_hash: '$2a$10$somehash',
          role: 'admin',
          status: 'active'
        }]
      });

      const bcrypt = require('bcryptjs');
      bcrypt.compare = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'SecurePass123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data.token');
      expect(response.body.data.role).toBe('admin');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user', async () => {
      const token = generateToken({ id: 1, email: 'user@example.com', role: 'admin' });

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });
  });
});
