const bcrypt = require('bcryptjs');
const logger = require('../config/logger');

const SALT_ROUNDS = 10;

const hashPassword = async (password) => {
  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    logger.error('Error hashing password', error);
    throw error;
  }
};

const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    logger.error('Error verifying password', error);
    throw error;
  }
};

module.exports = {
  hashPassword,
  verifyPassword
};
