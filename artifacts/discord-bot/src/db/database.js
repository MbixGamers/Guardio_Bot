import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DB_PATH = join(DATA_DIR, 'bot.db');

let db;
let SQL;

// Persist DB to disk periodically
function saveDb() {
  try {
    const data = db.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

export async function initDatabase() {
  mkdirSync(DATA_DIR, { recursive: true });
  SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();

  // Save to disk every 30 seconds and on process exit
  setInterval(saveDb, 30000);
  process.on('exit', saveDb);
  process.on('SIGINT', () => { saveDb(); process.exit(0); });
  process.on('SIGTERM', () => { saveDb(); process.exit(0); });

  console.log('[DB] Database initialized.');
}

function createTables() {
  db.run(`PRAGMA foreign_keys = ON;`);

  db.run(`
    CREATE TABLE IF NOT EXISTS security_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      log_channel_id TEXT,
      new_account_days INTEGER DEFAULT 7,
      spam_threshold INTEGER DEFAULT 5,
      spam_interval INTEGER DEFAULT 5000,
      mention_threshold INTEGER DEFAULT 5,
      duplicate_threshold INTEGER DEFAULT 3,
      nuke_threshold INTEGER DEFAULT 3,
      nuke_interval INTEGER DEFAULT 10000
    );

    CREATE TABLE IF NOT EXISTS panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      panel_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      UNIQUE(guild_id, panel_number)
    );

    CREATE TABLE IF NOT EXISTS buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      description TEXT,
      category_id TEXT NOT NULL,
      support_roles TEXT DEFAULT '[]',
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS questionnaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      button_id INTEGER NOT NULL,
      fields TEXT NOT NULL DEFAULT '[]',
      UNIQUE(button_id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      button_id INTEGER,
      claimed_by TEXT,
      status TEXT DEFAULT 'open',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(ticket_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS staff_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tickets_handled INTEGER DEFAULT 0,
      messages_sent INTEGER DEFAULT 0,
      credits INTEGER DEFAULT 0,
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS nuke_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      timestamp INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  saveDb();
}

// ── Synchronous-style wrappers around sql.js ──────────────────────────────────

export function getDb() {
  return db;
}

// Execute a statement that returns no rows (INSERT/UPDATE/DELETE/CREATE)
export function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { changes: db.getRowsModified(), lastInsertRowid: getLastInsertRowid() };
}

function getLastInsertRowid() {
  const result = db.exec('SELECT last_insert_rowid()');
  if (result.length && result[0].values.length) {
    return result[0].values[0][0];
  }
  return null;
}

// Return a single row as an object, or undefined
export function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

// Return all rows as an array of objects
export function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Execute raw SQL (for multi-statement init)
export function exec(sql) {
  db.exec(sql);
  saveDb();
}
