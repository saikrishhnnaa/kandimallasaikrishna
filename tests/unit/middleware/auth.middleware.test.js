const { verifyTokenMiddleware, authorize } = require('../../../src/middleware/auth.middleware');
const { verifyToken } = require('../../../src/utils/jwt');

jest.mock('../../../src/utils/jwt');

describe('Auth Middleware', () => {
  describe('verifyTokenMiddleware', () => {
    it('should verify valid token', () => {
      const req = {
        headers: {
          authorization: 'Bearer valid_token'
        }
      };
      const res = {};
      const next = jest.fn();

      verifyToken.mockReturnValue({
        id: 1,
        email: 'user@example.com',
        role: 'admin'
      });

      verifyTokenMiddleware(req, res, next);

      expect(req.user).toEqual({
        id: 1,
        email: 'user@example.com',
        role: 'admin'
      });
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 if no authorization header', () => {
      const req = {
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      verifyTokenMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing or invalid authorization header'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if invalid token', () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid_token'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      verifyTokenMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid or expired token'
        })
      );
    });
  });

  describe('authorize middleware', () => {
    it('should allow user with allowed role', () => {
      const req = {
        user: {
          id: 1,
          role: 'admin'
        }
      };
      const res = {};
      const next = jest.fn();

      authorize('admin', 'employee')(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 if user role not allowed', () => {
      const req = {
        user: {
          id: 1,
          role: 'sales_agent'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      authorize('admin', 'employee')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions for this action'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user not authenticated', () => {
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      authorize('admin')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User not authenticated'
        })
      );
    });
  });
});
