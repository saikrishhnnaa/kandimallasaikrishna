const { verifyToken } = require('../utils/jwt');
const logger = require('../config/logger');

const verifyTokenMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
        status: 401
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Token verification failed', error.message);
    return res.status(401).json({
      error: 'Invalid or expired token',
      status: 401
    });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'User not authenticated',
        status: 401
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.id} with role ${req.user.role}`);
      return res.status(403).json({
        error: 'Insufficient permissions for this action',
        status: 403
      });
    }

    next();
  };
};

module.exports = {
  verifyTokenMiddleware,
  authorize
};
