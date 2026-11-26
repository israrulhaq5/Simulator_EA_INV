'use strict';
const { connectDatabase, disconnectDatabase } = require('../config/database');
const logger = require('../config/logger');
(async () => {
  try { await connectDatabase(); logger.info('SQLite schema and indexes ensured'); }
  catch (error) { logger.error('SQLite initialization failed', { message: error.message }); process.exitCode = 1; }
  finally { await disconnectDatabase(); logger.close(); }
})();
