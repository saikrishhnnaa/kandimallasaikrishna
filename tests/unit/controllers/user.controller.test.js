const pool = require('../../../src/config/database');

describe('UserController', () => {
  let mockClient;
  const UserController = require('../../../src/controllers/user.controller');

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  describe('getAllUsers', () => {
    it('should return paginated list of users', async () => {
      const req = {
        query: { page: 1, limit: 10 },
        user: { role: 'admin' }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }) // Count query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, email: 'user1@example.com', name: 'User 1', role: 'admin' },
            { id: 2, email: 'user2@example.com', name: 'User 2', role: 'sales_agent' }
          ]
        });

      await UserController.getAllUsers(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Users retrieved successfully',
          data: expect.any(Array),
          pagination: expect.objectContaining({
            total: 20,
            page: 1,
            limit: 10
          })
        })
      );
    });

    it('should filter users by role', async () => {
      const req = {
        query: { role: 'sales_agent', page: 1, limit: 10 },
        user: { role: 'admin' }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await UserController.getAllUsers(req, res, next);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('role = $1'),
        expect.arrayContaining(['sales_agent'])
      );
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const req = { params: { id: 1 } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'user@example.com',
          name: 'Test User',
          role: 'admin'
        }]
      });

      await UserController.getUserById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User retrieved successfully',
          data: expect.objectContaining({
            id: 1,
            email: 'user@example.com'
          })
        })
      );
    });

    it('should return 404 if user not found', async () => {
      const req = { params: { id: 999 } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await UserController.getUserById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User not found',
          status: 404
        })
      );
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const req = {
        validatedData: {
          email: 'newuser@example.com',
          password: 'SecurePass123',
          name: 'New User',
          role: 'employee',
          phone: '1234567890',
          department: 'Sales'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check if exists
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            email: 'newuser@example.com',
            name: 'New User',
            role: 'employee',
            status: 'active'
          }]
        });

      // Mock bcrypt hash
      const bcrypt = require('bcryptjs');
      bcrypt.hash = jest.fn().mockResolvedValue('hashed_password');

      await UserController.createUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User created successfully',
          data: expect.objectContaining({
            email: 'newuser@example.com',
            role: 'employee'
          })
        })
      );
    });

    it('should return 409 if email already exists', async () => {
      const req = {
        validatedData: {
          email: 'existing@example.com',
          password: 'SecurePass123',
          name: 'User',
          role: 'employee'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await UserController.createUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User with this email already exists'
        })
      );
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const req = {
        params: { id: 1 },
        validatedData: {
          name: 'Updated Name',
          phone: '9876543210'
        }
      };

      const res = {
        json: jest.fn()
      };

      const next = jest.fn();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Check if exists
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            email: 'user@example.com',
            name: 'Updated Name',
            phone: '9876543210'
          }]
        });

      await UserController.updateUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User updated successfully',
          data: expect.objectContaining({
            name: 'Updated Name',
            phone: '9876543210'
          })
        })
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const req = { params: { id: 1 } };
      const res = { json: jest.fn() };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'user@example.com',
          name: 'Test User'
        }]
      });

      await UserController.deleteUser(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User deleted successfully',
          data: expect.objectContaining({
            id: 1,
            email: 'user@example.com'
          })
        })
      );
    });

    it('should return 404 if user to delete not found', async () => {
      const req = { params: { id: 999 } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await UserController.deleteUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
