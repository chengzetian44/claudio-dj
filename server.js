require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const stateDb = require('./STATE.DB.js');
const router = require('./ROUTER.JS');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';  // 允许局域网内其他设备访问（手机等）

const app = express();
const server = http.createServer(app);

// WebSocket
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws) => {
  console.log('[ws] client connected');

  ws.on('message', async (raw) => {
    try {
      const { type, payload } = JSON.parse(raw.toString());
      await router.handleWs(ws, type, payload);
    } catch (err) {
      console.error('[ws] message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', payload: { message: err.message } }));
    }
  });

  ws.on('close', () => {
    console.log('[ws] client disconnected');
  });
});

// Broadcast to all connected clients
function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(data);
  });
}

// Middleware
app.use(express.json());

// Static files — PWA frontend
app.use(express.static(path.join(__dirname, 'PWA')));
// TTS cache
app.use('/tts', express.static(path.join(__dirname, 'tts')));

// API Routes
app.post('/api/chat', async (req, res) => {
  try {
    const result = await router.handleChat(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/new', async (req, res) => {
  try {
    const sessionId = stateDb.createSession();
    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/next', async (req, res) => {
  try {
    const track = await router.getNextTrack();
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taste', (req, res) => {
  try {
    const tastePath = path.join(__dirname, 'USER', 'taste.md');
    const taste = fs.readFileSync(tastePath, 'utf-8');
    res.json({ taste });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/resolve', async (req, res) => {
  try {
    const keyword = req.query.keyword || '';
    const track = await router.resolveTrack(keyword);
    res.json({ track });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lyric', async (req, res) => {
  try {
    const trackId = req.query.id || '';
    const lyric = await router.getLyric(trackId);
    res.json({ lyric });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/like', (req, res) => {
  try {
    const { track } = req.body;
    stateDb.addLike(track);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skip', (req, res) => {
  try {
    const { track } = req.body;
    stateDb.addSkip(track);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const total = stateDb.getPlayCount();
    const today = stateDb.getTodayPlayCount();
    const likes = stateDb.getLikes(5);
    res.json({ total, today, likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const sessionId = req.query.sessionId || '';
    const messages = stateDb.getMessages(sessionId, 100);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plan/today', (req, res) => {
  try {
    const plans = stateDb.getTodayPlans();
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback — serve index.html for any unmatched route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'PWA', 'index.html'));
});

// Start
async function start() {
  try {
    await stateDb.init();
    console.log('[db] SQLite initialized');

    // Init scheduler
    require('./SCHEDULER.JS').init(broadcast);

    server.listen(PORT, HOST, () => {
      console.log(`[server] Claudio DJ running at http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('[server] failed to start:', err);
    process.exit(1);
  }
}

start();

module.exports = { broadcast };
