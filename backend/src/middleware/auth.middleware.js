// Authentication middleware

/**
 * Verify JWT token
 */
const verifyToken = (req, res, next) => {
  // TODO: Implement JWT verification
  next();
};

/**
 * Check user role
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // TODO: Implement role-based authorization
    next();
  };
};

module.exports = {
  verifyToken,
  authorize
};
