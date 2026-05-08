const LOG_LEVELS = {
  INFO: 'INFO',
  ERROR: 'ERROR',
  WARN: 'WARN',
  DEBUG: 'DEBUG'
};

const logger = {
  info: (message, data = '') => {
    console.log(`[${new Date().toISOString()}] [${LOG_LEVELS.INFO}] ${message}`, data ? data : '');
  },
  error: (message, error = '') => {
    console.error(`[${new Date().toISOString()}] [${LOG_LEVELS.ERROR}] ${message}`, error ? error : '');
  },
  warn: (message, data = '') => {
    console.warn(`[${new Date().toISOString()}] [${LOG_LEVELS.WARN}] ${message}`, data ? data : '');
  },
  debug: (message, data = '') => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] [${LOG_LEVELS.DEBUG}] ${message}`, data ? data : '');
    }
  }
};

module.exports = logger;
