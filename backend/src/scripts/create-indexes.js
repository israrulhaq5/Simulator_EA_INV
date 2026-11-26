'use strict';
const { connectDatabase, disconnectDatabase } = require('../config/database');
(async () => {
  try { await connectDatabase(); console.log('SQLite schema and indexes ensured'); }
  finally { await disconnectDatabase(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
