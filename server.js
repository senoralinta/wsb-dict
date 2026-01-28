// server.js
// Simple Express server with SQLite (better-sqlite3), session auth, and a minimal API for topics/posts.
// Run: node server.js
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');

const DB_FILE = path.join(__dirname, 'data.db');
const db = new Database(DB_FILE);

function migrate() {
  db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_moderator INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_hidden INTEGER DEFAULT 0,
    reports INTEGER DEFAULT 0,
    FOREIGN KEY(topic_id) REFERENCES topics(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topic_tags (
    topic_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY(topic_id, tag_id),
    FOREIGN KEY(topic_id) REFERENCES topics(id),
    FOREIGN KEY(tag_id) REFERENCES tags(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    value INTEGER,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  `);
}
migrate();

const app = express();
app.use(express.json());

// For local dev the frontend is served from the same origin; CORS set permissively for local use.
app.use(cors({ origin: true, credentials: true }));

// Session: set a reasonable maxAge so session persists after F5 / reloads (local dev only)
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: '.' }),
  secret: 'uzuntuden_uzakta',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// Helpers
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'unauthenticated' });
  next();
}
function requireModerator(req, res, next) {
  if (!req.session.user || !req.session.user.is_moderator) return res.status(403).json({ error: 'forbidden' });
  next();
}

// Auth endpoints
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const info = stmt.run(username, hash);
    const user = { id: info.lastInsertRowid, username, is_moderator: 0 };
    req.session.user = user;
    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: 'username_exists' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing' });
  const row = db.prepare('SELECT id, username, password_hash, is_moderator FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid' });
  }
  const user = { id: row.id, username: row.username, is_moderator: row.is_moderator };
  req.session.user = user;
  res.json({ user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// New: session info endpoint so frontend can restore login state after reload
app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// Topics
app.get('/api/topics', (req, res) => {
  const topics = db.prepare(`
    SELECT t.id, t.title, t.created_at, u.username as author
    FROM topics t LEFT JOIN users u ON u.id = t.created_by
    ORDER BY t.created_at DESC
  `).all();
  const tagStmt = db.prepare('SELECT tg.name FROM tags tg JOIN topic_tags tt ON tg.id=tt.tag_id WHERE tt.topic_id = ?');
  topics.forEach(t => t.tags = tagStmt.all(t.id).map(r => r.name));
  res.json({ topics });
});

app.post('/api/topics', requireAuth, (req, res) => {
  const { title, tags } = req.body || {};
  if (!title) return res.status(400).json({ error: 'missing title' });
  const info = db.prepare('INSERT INTO topics (title, created_by) VALUES (?, ?)').run(title, req.session.user.id);
  const topicId = info.lastInsertRowid;
  if (Array.isArray(tags)) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const link = db.prepare('INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, (SELECT id FROM tags WHERE name = ?))');
    const tx = db.transaction((arr) => {
      for (const tag of arr) {
        insertTag.run(tag);
        link.run(topicId, tag);
      }
    });
    tx(tags);
  }
  res.status(201).json({ topicId });
});

app.get('/api/topics/:id', (req, res) => {
  const id = Number(req.params.id);
  const topic = db.prepare('SELECT id, title, created_at FROM topics WHERE id = ?').get(id);
  if (!topic) return res.status(404).json({ error: 'not found' });
  topic.tags = db.prepare('SELECT tg.name FROM tags tg JOIN topic_tags tt ON tg.id=tt.tag_id WHERE tt.topic_id = ?').all(id).map(r => r.name);
  const posts = db.prepare('SELECT p.id, p.content, p.created_at, p.is_hidden, p.reports, u.username FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.topic_id = ? ORDER BY p.created_at ASC').all(id);
  const voteSum = db.prepare('SELECT COALESCE(SUM(value),0) as score FROM votes WHERE post_id = ?');
  posts.forEach(p => p.score = voteSum.get(p.id).score);
  topic.posts = posts;
  res.json({ topic });
});

// Posts
app.post('/api/topics/:id/posts', requireAuth, (req, res) => {
  const topicId = Number(req.params.id);
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'missing content' });
  const info = db.prepare('INSERT INTO posts (topic_id, user_id, content) VALUES (?, ?, ?)').run(topicId, req.session.user.id, content);
  res.status(201).json({ postId: info.lastInsertRowid });
});

// Voting
app.post('/api/posts/:id/vote', requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  const value = Number(req.body.value) === 1 ? 1 : -1;
  const userId = req.session.user.id;
  const upsert = db.prepare(`
    INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, ?)
    ON CONFLICT(post_id, user_id) DO UPDATE SET value = excluded.value
  `);
  upsert.run(postId, userId, value);
  const score = db.prepare('SELECT COALESCE(SUM(value),0) as score FROM votes WHERE post_id = ?').get(postId).score;
  res.json({ score });
});

// Search
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ topics: [], posts: [] });
  const like = `%${q}%`;
  const topics = db.prepare('SELECT id, title FROM topics WHERE title LIKE ?').all(like);
  const posts = db.prepare('SELECT p.id, p.content, p.topic_id FROM posts p WHERE content LIKE ?').all(like);
  res.json({ topics, posts });
});

// Reporting & moderation
app.post('/api/posts/:id/report', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE posts SET reports = reports + 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});
app.post('/api/posts/:id/hide', requireAuth, requireModerator, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE posts SET is_hidden = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Serve frontend from public/
app.use('/', express.static(path.join(__dirname, 'public')));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});