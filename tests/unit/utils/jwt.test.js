const { generateToken, verifyToken, decodeToken } = require('../../../src/utils/jwt');
const jwt = require('jsonwebtoken');

jest.mock('jsonwebtoken');

describe('JWT Utilities', () => {
  const payload = { id: 1, email: 'user@example.com', role: 'admin' };

  describe('generateToken', () => {
    it('should generate valid token', () => {
      jwt.sign = jest.fn().mockReturnValue('test_token');

      const token = generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, expect.any(String), {
        expiresIn: expect.any(String)
      });
      expect(token).toBe('test_token');
    });

    it('should throw error on sign failure', () => {
      jwt.sign = jest.fn().mockImplementation(() => {
        throw new Error('Sign error');
      });

      expect(() => generateToken(payload)).toThrow('Sign error');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      jwt.verify = jest.fn().mockReturnValue(payload);

      const result = verifyToken('valid_token');

      expect(jwt.verify).toHaveBeenCalledWith('valid_token', expect.any(String));
      expect(result).toEqual(payload);
    });

    it('should throw error for invalid token', () => {
      jwt.verify = jest.fn().mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => verifyToken('invalid_token')).toThrow('Invalid token');
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      jwt.decode = jest.fn().mockReturnValue(payload);

      const result = decodeToken('token');

      expect(jwt.decode).toHaveBeenCalledWith('token');
      expect(result).toEqual(payload);
    });

    it('should return null on decode error', () => {
      jwt.decode = jest.fn().mockImplementation(() => {
        throw new Error('Decode error');
      });

      const result = decodeToken('invalid_token');

      expect(result).toBeNull();
    });
  });
});
