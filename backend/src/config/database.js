'use strict';
const storage = require('../storage/sqlite');
async function connectDatabase() { storage.open(); return storage.status(); }
async function disconnectDatabase() { await storage.close(); }
function getDatabaseStatus() { return storage.status(); }
module.exports = { connectDatabase, disconnectDatabase, getDatabaseStatus };
