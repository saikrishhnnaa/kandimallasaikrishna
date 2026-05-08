const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

const generateToken = (payload) => {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY
    });
    return token;
  } catch (error) {
    logger.error('Error generating JWT token', error);
    throw error;
  }
};

const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    logger.error('Error verifying JWT token', error.message);
    throw error;
  }
};

const decodeToken = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded;
  } catch (error) {
    logger.error('Error decoding JWT token', error);
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  decodeToken
};
