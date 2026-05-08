const pool = require('../../../src/config/database');
const bcrypt = require('bcryptjs');

// Mock bcrypt
jest.mock('bcryptjs');

describe('AuthController', () => {
  let mockClient;
  const AuthController = require('../../../src/controllers/auth.controller');

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const req = {
        validatedData: {
          email: 'newuser@example.com',
          password: 'SecurePass123',
          name: 'New User',
          role: 'sales_agent'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      // Mock database response
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check if user exists
        .mockResolvedValueOnce({ // Insert new user
          rows: [{
            id: 1,
            email: 'newuser@example.com',
            name: 'New User',
            role: 'sales_agent'
          }]
        });

      // Mock bcrypt hash
      bcrypt.hash = jest.fn().mockResolvedValue('hashed_password');

      await AuthController.register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registered successfully',
          data: expect.objectContaining({
            email: 'newuser@example.com',
            name: 'New User',
            role: 'sales_agent',
            token: expect.any(String)
          })
        })
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 409 if user already exists', async () => {
      const req = {
        validatedData: {
          email: 'existing@example.com',
          password: 'SecurePass123',
          name: 'User',
          role: 'sales_agent'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      // Mock user exists
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await AuthController.register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User with this email already exists',
          status: 409
        })
      );
    });

    it('should call next with error on database error', async () => {
      const req = {
        validatedData: {
          email: 'newuser@example.com',
          password: 'SecurePass123',
          name: 'New User',
          role: 'sales_agent'
        }
      };

      const res = {};
      const next = jest.fn();
      const error = new Error('Database error');

      mockClient.query.mockRejectedValueOnce(error);

      await AuthController.register(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login user successfully with valid credentials', async () => {
      const req = {
        validatedData: {
          email: 'user@example.com',
          password: 'SecurePass123'
        }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'user@example.com',
          name: 'Test User',
          password_hash: 'hashed_password',
          role: 'sales_agent',
          status: 'active'
        }]
      });

      bcrypt.compare = jest.fn().mockResolvedValue(true);

      await AuthController.login(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful',
          data: expect.objectContaining({
            email: 'user@example.com',
            token: expect.any(String)
          })
        })
      );
    });

    it('should return 401 for invalid email', async () => {
      const req = {
        validatedData: {
          email: 'nonexistent@example.com',
          password: 'password'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await AuthController.login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid email or password',
          status: 401
        })
      );
    });

    it('should return 401 for invalid password', async () => {
      const req = {
        validatedData: {
          email: 'user@example.com',
          password: 'WrongPassword'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'user@example.com',
          password_hash: 'hashed_password',
          role: 'sales_agent',
          status: 'active'
        }]
      });

      bcrypt.compare = jest.fn().mockResolvedValue(false);

      await AuthController.login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid email or password',
          status: 401
        })
      );
    });

    it('should return 403 for inactive user', async () => {
      const req = {
        validatedData: {
          email: 'user@example.com',
          password: 'SecurePass123'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'user@example.com',
          password_hash: 'hashed_password',
          role: 'sales_agent',
          status: 'inactive'
        }]
      });

      bcrypt.compare = jest.fn().mockResolvedValue(true);

      await AuthController.login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User account is inactive',
          status: 403
        })
      );
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const req = {
        user: { email: 'user@example.com' }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      await AuthController.logout(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Logged out successfully'
      });
    });
  });
});
