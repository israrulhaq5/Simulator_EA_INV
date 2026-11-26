'use strict';

// SQLite is the only runtime datastore. Mongoose model classes are used solely
// for their offline document validation, defaults and existing ObjectId shape.
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, chmodSync } = require('node:fs');
const path = require('node:path');
const { config } = require('../config/environment');

const collections = {
  Device: [['identifier'], ['registerProfile'], ['isEnabled', 'polling.enabled', 'nextPollAt', 'pollLeaseUntil']],
  RegisterProfile: [['identifier'], ['isActive', 'updatedAt']],
  LatestValue: [['device', 'registerKey'], ['device', 'group', 'registerKey']],
  CommunicationLog: [['device', 'timestamp'], ['timestamp']],
  GatewayConfiguration: [['key']],
  ZeroExportConfiguration: [['key']],
  SimulatorDeviceSettings: [['key']],
};
let db;
let queue = Promise.resolve();
let lastPrune = 0;

function table(name) {
  if (!Object.hasOwn(collections, name)) throw new Error('Unknown SQLite collection: ' + name);
  return '"' + name + '"';
}
function field(key) {
  if (key === '_id') return 'id';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(key)) {
    throw new Error('Unsupported SQLite field: ' + key);
  }
  return "json_extract(body, '$." + key + "')";
}
function scalar(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null) return null;
  if (typeof value === 'object') return String(value);
  return value;
}
function predicate(filter, args) {
  const expressions = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and' || key === '$or') {
      const parts = value.map(item => '(' + predicate(item, args) + ')');
      expressions.push(parts.length ? '(' + parts.join(key === '$and' ? ' AND ' : ' OR ') + ')' : key === '$and' ? '1' : '0');
      continue;
    }
    const column = field(key);
    if (value instanceof RegExp) {
      args.push(value.source, value.flags);
      expressions.push('js_regexp(?, ?, ' + column + ') = 1');
    } else if (value === null || value === undefined) {
      expressions.push(column + ' IS NULL');
    } else if (typeof value === 'object' && !(value instanceof Date) && !value._bsontype) {
      for (const [op, operand] of Object.entries(value)) {
        if (op === '$ne' && operand === null) expressions.push(column + ' IS NOT NULL');
        else if (op === '$ne') { args.push(scalar(operand)); expressions.push('(' + column + ' IS NULL OR ' + column + ' <> ?)'); }
        else if (op === '$lte') { args.push(scalar(operand)); expressions.push(column + ' <= ?'); }
        else if (op === '$in') {
          args.push(...operand.map(scalar));
          expressions.push(operand.length ? column + ' IN (' + operand.map(() => '?').join(',') + ')' : '0');
        } else throw new Error('Unsupported SQLite filter: ' + op);
      }
    } else {
      args.push(scalar(value));
      expressions.push(column + ' = ?');
    }
  }
  return expressions.join(' AND ') || '1';
}
function enqueue(action) {
  const result = queue.then(() => {
    if (!db) throw new Error('SQLite is not connected');
    return action();
  });
  queue = result.catch(() => {});
  return result;
}
function prune() {
  const cutoff = new Date(Date.now() - config.monitoring.communicationLogRetentionDays * 86400000).toISOString();
  db.prepare("DELETE FROM CommunicationLog WHERE json_extract(body, '$.timestamp') < ?").run(cutoff);
  lastPrune = Date.now();
}
function open(file = config.database.file) {
  if (db) return;
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(file);
  db = connection;
  try {
    if (file !== ':memory:') chmodSync(file, 0o600);
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('SQLite database schema is newer than this application');
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    db.function('js_regexp', (source, flags, value) => value == null ? 0 : Number(new RegExp(source, flags).test(String(value))));
    db.exec('BEGIN IMMEDIATE');
    for (const [name, indexes] of Object.entries(collections)) {
      db.exec('CREATE TABLE IF NOT EXISTS ' + table(name) + ' (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)))');
      indexes.forEach((keys, index) => {
        const unique = index === 0 && name !== 'CommunicationLog';
        db.exec('CREATE ' + (unique ? 'UNIQUE ' : '') + 'INDEX IF NOT EXISTS "' + name + '_idx_' + index + '" ON ' + table(name) + '(' + keys.map(field).join(',') + ')');
      });
    }
    prune();
    db.exec('PRAGMA user_version=1; COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close(); db = undefined;
    throw error;
  }
}
async function close() {
  await queue;
  if (db) { db.close(); db = undefined; }
}
function status() {
  return { engine: 'sqlite', state: db ? 'connected' : 'disconnected', readyState: db ? 1 : 0, connected: Boolean(db) };
}
async function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    if (/UNIQUE constraint failed/i.test(error.message)) error.code = 11000;
    throw error;
  }
}
function select(name, filter, order, offset = 0, limit = -1) {
  const args = [];
  const where = predicate(filter, args);
  const sorting = Object.entries(order || {}).map(([key, direction]) => field(key) + (direction === -1 ? ' DESC' : ' ASC')).join(', ');
  const sql = 'SELECT body FROM ' + table(name) + ' WHERE ' + where + (sorting ? ' ORDER BY ' + sorting : '') + ' LIMIT ? OFFSET ?';
  return db.prepare(sql).all(...args, limit, offset).map(row => JSON.parse(row.body));
}
function populate(doc, definitions) {
  if (!doc) return doc;
  for (const definition of definitions) {
    const spec = typeof definition === 'string' ? { path: definition } : definition;
    if (spec.path !== 'registerProfile') throw new Error('Unsupported population: ' + spec.path);
    const profile = doc.registerProfile ? select('RegisterProfile', { _id: doc.registerProfile }, null, 0, 1)[0] : null;
    doc.registerProfile = profile && spec.select ? Object.fromEntries(['_id', ...spec.select.split(' ')].filter(key => Object.hasOwn(profile, key)).map(key => [key, profile[key]])) : profile || null;
  }
  return doc;
}
async function persist(Model, previous, patch, insert = false) {
  const document = new Model(previous || {});
  if (insert && patch.$setOnInsert) document.set(patch.$setOnInsert);
  document.set(patch.$set || {});
  for (const [key, amount] of Object.entries(patch.$inc || {})) document.set(key, (document.get(key) || 0) + amount);
  for (const key of Object.keys(patch.$unset || {})) document.set(key, undefined);
  if (Model.schema.options.timestamps) {
    if (!document.createdAt) document.createdAt = new Date();
    document.updatedAt = new Date();
  }
  await document.validate();
  const body = JSON.parse(JSON.stringify(document.toObject({ virtuals: true })));
  if (previous) {
    if (String(body._id) !== String(previous._id)) throw new Error('Cannot change record identity');
    db.prepare('UPDATE ' + table(Model.modelName) + ' SET body = ? WHERE id = ?').run(JSON.stringify(body), String(body._id));
  } else {
    db.prepare('INSERT INTO ' + table(Model.modelName) + '(id,body) VALUES (?,?)').run(String(body._id), JSON.stringify(body));
  }
  if (Model.modelName === 'CommunicationLog' && Date.now() - lastPrune > 60000) prune();
  return body;
}
class Query {
  constructor(Model, filter, operation, update, options = {}) {
    this.Model = Model; this.filter = filter; this.operation = operation; this.update = update; this.options = options;
    this.order = options.sort; this.offset = 0; this.max = -1; this.populates = [];
  }
  sort(value) { this.order = value; return this; }
  skip(value) { this.offset = value; return this; }
  limit(value) { this.max = value; return this; }
  populate(value) { this.populates.push(...(Array.isArray(value) ? value : [value])); return this; }
  lean() { return this; }
  exec() {
    return enqueue(async () => {
      const name = this.Model.modelName;
      const apply = doc => populate(doc, this.populates);
      if (this.operation === 'count') {
        const args = [];
        return db.prepare('SELECT count(*) AS total FROM ' + table(name) + ' WHERE ' + predicate(this.filter, args)).get(...args).total;
      }
      if (this.operation === 'find' || this.operation === 'one') {
        const rows = select(name, this.filter, this.order, this.offset, this.operation === 'one' ? 1 : this.max);
        return this.operation === 'one' ? apply(rows[0] || null) : rows.map(apply);
      }
      return transaction(async () => {
        const rows = select(name, this.filter, this.order, 0, this.operation === 'manyUpdate' ? -1 : 1);
        if (this.operation === 'delete') {
          if (!rows.length) return null;
          db.prepare('DELETE FROM ' + table(name) + ' WHERE id = ?').run(String(rows[0]._id));
          return apply(rows[0]);
        }
        if (this.operation === 'manyUpdate') {
          for (const row of rows) await persist(this.Model, row, this.update);
          return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
        }
        if (!rows.length && !this.options.upsert) return null;
        const prior = rows[0];
        const updated = await persist(this.Model, prior, this.update, !prior);
        return apply(this.options.new || !prior ? updated : prior);
      });
    });
  }
}
function sqliteModel(Model) {
  return {
    modelName: Model.modelName,
    find: (filter = {}) => new Query(Model, filter, 'find'),
    findOne: (filter = {}) => new Query(Model, filter, 'one'),
    findById: id => new Query(Model, { _id: id }, 'one'),
    countDocuments: (filter = {}) => new Query(Model, filter, 'count'),
    findOneAndUpdate: (filter, update, options) => new Query(Model, filter, 'update', update, options),
    findByIdAndUpdate: (id, update, options) => new Query(Model, { _id: id }, 'update', update, options),
    findByIdAndDelete: id => new Query(Model, { _id: id }, 'delete'),
    updateMany: (filter, update) => new Query(Model, filter, 'manyUpdate', update),
    create: payload => enqueue(() => transaction(() => persist(Model, null, { $set: payload }, true))),
    bulkWrite: operations => enqueue(() => transaction(async () => {
      let matchedCount = 0; let upsertedCount = 0;
      for (const operation of operations) {
        const { filter, update, upsert } = operation.updateOne;
        const row = select(Model.modelName, filter, null, 0, 1)[0];
        if (!row && !upsert) continue;
        await persist(Model, row, update, !row);
        if (row) matchedCount++; else upsertedCount++;
      }
      return { acknowledged: true, matchedCount, modifiedCount: matchedCount, upsertedCount };
    })),
  };
}
module.exports = { open, close, status, sqliteModel };
