const { hashPassword, verifyPassword } = require('../../../src/utils/password');
const bcrypt = require('bcryptjs');

jest.mock('bcryptjs');

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      bcrypt.hash = jest.fn().mockResolvedValue('hashed_password');

      const result = await hashPassword('SecurePass123');

      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePass123', 10);
      expect(result).toBe('hashed_password');
    });

    it('should throw error on hash failure', async () => {
      bcrypt.hash = jest.fn().mockRejectedValue(new Error('Hash error'));

      await expect(hashPassword('password')).rejects.toThrow('Hash error');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      bcrypt.compare = jest.fn().mockResolvedValue(true);

      const result = await verifyPassword('SecurePass123', 'hashed_password');

      expect(bcrypt.compare).toHaveBeenCalledWith('SecurePass123', 'hashed_password');
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      bcrypt.compare = jest.fn().mockResolvedValue(false);

      const result = await verifyPassword('WrongPassword', 'hashed_password');

      expect(result).toBe(false);
    });

    it('should throw error on comparison failure', async () => {
      bcrypt.compare = jest.fn().mockRejectedValue(new Error('Compare error'));

      await expect(verifyPassword('password', 'hashed')).rejects.toThrow();
    });
  });
});
