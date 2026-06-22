const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'claudio.db');

let db;

function init() {
  if (db) return; // Already initialized
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      cover_url TEXT,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      scheduled_at TEXT,
      status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS context (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      liked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      skipped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Indexes — speed up common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_play_history_played ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_likes_liked ON likes(liked_at);
    CREATE INDEX IF NOT EXISTS idx_skips_skipped ON skips(skipped_at);
  `);

  console.log('[db] tables ready');
}

// ─── Sessions ────────────────────────────────────────

function createSession() {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (id) VALUES (?)').run(id);
  return id;
}

// ─── Messages ────────────────────────────────────────

function saveMessage(sessionId, role, content) {
  return db.prepare(
    'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
  ).run(sessionId, role, content);
}

function getMessages(sessionId, limit = 50) {
  return db.prepare(
    'SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(sessionId, limit).reverse();
}

// ─── Play History ────────────────────────────────────

function addPlayHistory(track) {
  return db.prepare(
    'INSERT INTO play_history (track_id, title, artist, album, cover_url) VALUES (?, ?, ?, ?, ?)'
  ).run(track.id || null, track.title, track.artist, track.album || null, track.cover_url || null);
}

function getRecentPlays(limit = 20) {
  return db.prepare(
    'SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?'
  ).all(limit);
}

function recentlyPlayed(minutes = 240) {
  return db.prepare(
    "SELECT track_id FROM play_history WHERE played_at > datetime('now', ? || ' minutes')"
  ).all(`-${minutes}`).map(r => r.track_id);
}

// ─── Plans ───────────────────────────────────────────

function getTodayPlans() {
  return db.prepare(
    "SELECT * FROM plans WHERE date(scheduled_at) = date('now', 'localtime') ORDER BY scheduled_at"
  ).all();
}

function addPlan(title, scheduledAt) {
  return db.prepare(
    'INSERT INTO plans (title, scheduled_at) VALUES (?, ?)'
  ).run(title, scheduledAt);
}

// ─── Context ─────────────────────────────────────────

function getContext(key) {
  const row = db.prepare('SELECT value FROM context WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setContext(key, value) {
  db.prepare(
    'INSERT OR REPLACE INTO context (key, value) VALUES (?, ?)'
  ).run(key, value);
}

// ─── Likes ─────────────────────────────────────────

function addLike(track) {
  return db.prepare(
    'INSERT INTO likes (track_id, title, artist) VALUES (?, ?, ?)'
  ).run(track.id || null, track.title, track.artist);
}

function removeLike(trackId) {
  return db.prepare('DELETE FROM likes WHERE track_id = ?').run(trackId);
}

function isLiked(trackId) {
  const row = db.prepare('SELECT 1 FROM likes WHERE track_id = ?').get(trackId);
  return !!row;
}

function getLikes(limit = 50) {
  return db.prepare('SELECT * FROM likes ORDER BY liked_at DESC LIMIT ?').all(limit);
}

// ─── Skips ─────────────────────────────────────────

function addSkip(track) {
  return db.prepare(
    'INSERT INTO skips (track_id, title, artist) VALUES (?, ?, ?)'
  ).run(track.id || null, track.title, track.artist);
}

function getSkips(limit = 20) {
  return db.prepare('SELECT * FROM skips ORDER BY skipped_at DESC LIMIT ?').all(limit);
}

// ─── Stats ─────────────────────────────────────────

function getPlayCount() {
  const row = db.prepare('SELECT COUNT(*) as total FROM play_history').get();
  return row ? row.total : 0;
}

function getTodayPlayCount() {
  const row = db.prepare(
    "SELECT COUNT(*) as total FROM play_history WHERE date(played_at) = date('now', 'localtime')"
  ).get();
  return row ? row.total : 0;
}

// ─── Export ──────────────────────────────────────────

module.exports = {
  init,
  createSession,
  saveMessage,
  getMessages,
  addPlayHistory,
  getRecentPlays,
  recentlyPlayed,
  getTodayPlans,
  addPlan,
  getContext,
  setContext,
  addLike,
  removeLike,
  isLiked,
  getLikes,
  addSkip,
  getSkips,
  getPlayCount,
  getTodayPlayCount,
};
