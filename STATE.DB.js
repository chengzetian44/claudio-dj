// SQLite via sql.js — pure JavaScript, no native compilation
// Works everywhere: Windows, Railway, Vercel, etc.

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'claudio.db');

let db;

// ─── Init ──────────────────────────────────────────

async function init() {
  if (db) return;

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      cover_url TEXT,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      scheduled_at TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS context (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      liked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS skips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      skipped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_play_history_played ON play_history(played_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_likes_liked ON likes(liked_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_skips_skipped ON skips(skipped_at)');

  save();
  console.log('[db] tables ready');
}

// ─── Save to disk ──────────────────────────────────

function save() {
  if (!db) return;
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buf);
}

// ─── Helpers ───────────────────────────────────────

function run(sql, params) {
  if (params == null) params = [];
  if (!Array.isArray(params)) params = [params];
  db.run(sql, params);
  save(); // persist every write
}

function get(sql, params) {
  if (params == null) params = [];
  if (!Array.isArray(params)) params = [params];
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

function all(sql, params) {
  if (params == null) params = [];
  if (!Array.isArray(params)) params = [params];
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ─── Sessions ──────────────────────────────────────

function createSession() {
  const id = crypto.randomUUID();
  run('INSERT INTO sessions (id) VALUES (?)', id);
  return id;
}

// ─── Messages ──────────────────────────────────────

function saveMessage(sessionId, role, content) {
  run('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)', [sessionId, role, content]);
}

function getMessages(sessionId, limit = 50) {
  const rows = all(
    'SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
    [sessionId, limit]
  );
  return rows.reverse();
}

// ─── Play History ──────────────────────────────────

function addPlayHistory(track) {
  run('INSERT INTO play_history (track_id, title, artist, album, cover_url) VALUES (?, ?, ?, ?, ?)',
    [track.id || null, track.title, track.artist, track.album || null, track.cover_url || null]);
}

function getRecentPlays(limit = 20) {
  return all('SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?', limit);
}

function recentlyPlayed(minutes = 240) {
  const rows = all(
    "SELECT track_id FROM play_history WHERE played_at > datetime('now', ? || ' minutes')",
    `-${minutes}`
  );
  return rows.map(r => r.track_id);
}

// ─── Plans ─────────────────────────────────────────

function getTodayPlans() {
  return all("SELECT * FROM plans WHERE date(scheduled_at) = date('now', 'localtime') ORDER BY scheduled_at");
}

function addPlan(title, scheduledAt) {
  run('INSERT INTO plans (title, scheduled_at) VALUES (?, ?)', [title, scheduledAt]);
}

// ─── Context ───────────────────────────────────────

function getContext(key) {
  const row = get('SELECT value FROM context WHERE key = ?', key);
  return row ? row.value : null;
}

function setContext(key, value) {
  run('INSERT OR REPLACE INTO context (key, value) VALUES (?, ?)', [key, value]);
}

// ─── Likes ────────────────────────────────────────

function addLike(track) {
  run('INSERT INTO likes (track_id, title, artist) VALUES (?, ?, ?)',
    [track.id || null, track.title, track.artist]);
}

function removeLike(trackId) {
  run('DELETE FROM likes WHERE track_id = ?', trackId);
}

function isLiked(trackId) {
  return !!get('SELECT 1 FROM likes WHERE track_id = ?', trackId);
}

function getLikes(limit = 50) {
  return all('SELECT * FROM likes ORDER BY liked_at DESC LIMIT ?', limit);
}

// ─── Skips ────────────────────────────────────────

function addSkip(track) {
  run('INSERT INTO skips (track_id, title, artist) VALUES (?, ?, ?)',
    [track.id || null, track.title, track.artist]);
}

function getSkips(limit = 20) {
  return all('SELECT * FROM skips ORDER BY skipped_at DESC LIMIT ?', limit);
}

// ─── Stats ────────────────────────────────────────

function getPlayCount() {
  return (get('SELECT COUNT(*) as total FROM play_history') || {}).total || 0;
}

function getTodayPlayCount() {
  return (get("SELECT COUNT(*) as total FROM play_history WHERE date(played_at) = date('now', 'localtime')") || {}).total || 0;
}

// ─── Export ────────────────────────────────────────

module.exports = {
  init,
  createSession, saveMessage, getMessages,
  addPlayHistory, getRecentPlays, recentlyPlayed,
  getTodayPlans, addPlan,
  getContext, setContext,
  addLike, removeLike, isLiked, getLikes,
  addSkip, getSkips,
  getPlayCount, getTodayPlayCount,
};
