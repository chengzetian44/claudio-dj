const path = require('path');
const fs = require('fs');

// Lazy-loaded modules
let musicService = null;
let brainService = null;
let stateDb = null;

function getMusic() {
  if (!musicService) musicService = require('./MUSIC/netease');
  return musicService;
}

function getBrain() {
  if (!brainService) brainService = require('./BRAIN/claude');
  return brainService;
}

function getDb() {
  if (!stateDb) stateDb = require('./STATE.DB.js');
  return stateDb;
}

// ─── Shared Helpers ───────────────────────────────────

async function searchWithFallback(style, count) {
  const music = getMusic();
  // Try full style keyword first
  let tracks = await music.search(style, count);
  if (tracks && tracks.length > 0) return tracks;

  // Fallback: split into simpler keywords and try each
  const parts = style.split(/[\s,，/、]+/).filter(p => p.length >= 2 && !/^[a-z]$/i.test(p));
  for (const part of parts.slice(0, 4)) {
    tracks = await music.search(part, count);
    if (tracks && tracks.length > 0) return tracks;
  }
  return [];
}

function readTasteHint() {
  const tastePath = path.join(__dirname, 'USER', 'taste.md');
  try {
    const raw = fs.readFileSync(tastePath, 'utf-8');
    const match = raw.match(/偏好风格\n([\s\S]*?)(?=\n##)/);
    if (match) return match[1].trim();
    return raw.slice(0, 300);
  } catch (_) { return ''; }
}

// ─── Intent Classification ───────────────────────────

const INTENTS = {
  PLAY: 'play',
  RECOMMEND: 'recommend',
  CHAT: 'chat',
  QUERY: 'query',
};

function classifyIntent(text) {
  const t = text.toLowerCase().trim();

  // Check recommend first (higher priority than vague "听")
  const recommendPatterns = ['推荐', '有什么好听的', '来点', '随便放', 'suggest'];
  for (const p of recommendPatterns) {
    if (t.includes(p)) return INTENTS.RECOMMEND;
  }

  // Play: "听" only when it's the main verb, not "适合XX听的歌"
  const playPatterns = ['我想听', '想听', '播放', '放一首', '来一首', '来首', '点歌', '下一首', '换一首', 'play'];
  for (const p of playPatterns) {
    if (t.includes(p)) return INTENTS.PLAY;
  }
  // Bare "听" — match only if not part of "听的" relative clause
  // "我想听周杰伦" → PLAY  /  "适合跑步听的歌" → skip (caught by recommend or falls to CHAT)
  if (t.includes('听') && !t.includes('听的')) return INTENTS.PLAY;

  // Simple queries that don't need AI
  const queryPatterns = ['几点', '日期', '今天天气', '时间'];
  for (const p of queryPatterns) {
    if (t.includes(p)) return INTENTS.QUERY;
  }

  return INTENTS.CHAT;
}

// ─── Chat Handler ────────────────────────────────────

async function handleChat(body) {
  const { message, sessionId } = body;
  const db = getDb();

  let sid = sessionId || db.createSession();
  db.saveMessage(sid, 'user', message);

  const intent = classifyIntent(message);

  switch (intent) {
    case INTENTS.PLAY:
      return handlePlayIntent(message, sid);

    case INTENTS.RECOMMEND:
      return handleRecommendWithFallback(message, sid);

    case INTENTS.QUERY:
      return handleQueryIntent(message, sid);

    default:
      return handleAIChat(message, sid);
  }
}

// ─── Intent Handlers ────────────────────────────────

async function handlePlayIntent(message, sessionId) {
  const keyword = message.replace(/播放|放一首|来一首|来首|我想听|想听|听|点歌/g, '').trim() || '推荐';
  const track = await resolveTrack(keyword);

  if (track) {
    return {
      reply: `好的，为你播放 ${track.ar?.[0]?.name || ''} 的《${track.name}》`,
      action: 'play',
      data: { track },
    };
  }
  return { reply: '抱歉，没有找到这首歌。试试换个关键词？', action: 'none' };
}

async function handleRecommendWithFallback(message, sessionId) {
  // Try AI first — it gives more personalized recommendations
  try {
    const brain = getBrain();
    const db = getDb();
    const history = db.getMessages(sessionId, 10);
    const result = await brain.chat(message, history);
    if (result && result.message) {
      db.saveMessage(sessionId, 'assistant', result.message);

      // If AI wants to recommend, search for matching tracks
      if (result.action === 'recommend' && result.data?.style) {
        const music = getMusic();
        let tracks = await searchWithFallback(result.data.style, 3);
        if (tracks && tracks.length > 0) {
          // Resolve ALL tracks' URLs in parallel
          await Promise.all(tracks.map(async (t) => {
            const url = await music.getTrackUrl(t.id);
            if (url) t.url = url;
          }));
          result.data.tracks = tracks;
          result.data.track = tracks[0];  // first track for immediate playback
        }
      }
      // If AI wants to play track(s), resolve them
      if (result.action === 'play') {
        if (result.data?.trackNames && result.data.trackNames.length > 1) {
          // Multiple tracks — resolve all in parallel
          const resolved = await Promise.all(
            result.data.trackNames.map(tn => {
              const kw = tn.artist ? `${tn.trackName} ${tn.artist}` : tn.trackName;
              return resolveTrack(kw);
            })
          );
          const valid = resolved.filter(Boolean);
          if (valid.length > 0) {
            result.data.tracks = valid;
            result.data.track = valid[0];
          }
        } else if (result.data?.trackName) {
          // Single track — legacy path
          const keyword = result.data.artist
            ? `${result.data.trackName} ${result.data.artist}`
            : result.data.trackName;
          const track = await resolveTrack(keyword);
          if (track) result.data.track = track;
        }
      }

      return { reply: result.message, action: result.action, data: result.data };
    }
  } catch (err) {
    console.error('[router] AI recommend failed, falling back to local:', err.message);
  }

  // Fallback to local recommendation (no AI needed)
  return handleRecommendIntent(message, sessionId);
}

async function handleRecommendIntent(message, sessionId) {
  const music = getMusic();
  const db = getDb();
  const recent = db.recentlyPlayed();
  const tasteHint = readTasteHint();

  const tracks = await music.recommend(tasteHint);

  if (tracks && tracks.length > 0) {
    // Take top 3, avoid recently played
    const picks = tracks.filter(t => !recent.includes(String(t.id))).slice(0, 3);
    const selected = picks.length > 0 ? picks : tracks.slice(0, 3);

    // Resolve ALL selected tracks' URLs
    await Promise.all(selected.map(async (t) => {
      const url = await music.getTrackUrl(t.id);
      if (url) t.url = url;
    }));

    // Build a nice reply with track list
    const list = selected.map((t, i) =>
      `${i + 1}. ${t.ar?.[0]?.name || ''} — 《${t.name}》`
    ).join('\n');

    return {
      reply: `为你准备了 ${selected.length} 首，马上开始播放：\n${list}`,
      action: 'recommend',
      data: { track: selected[0], tracks: selected },
    };
  }
  return { reply: '暂时没有新的推荐，试试搜索特定歌曲？', action: 'none' };
}

async function handleQueryIntent(message, sessionId) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  return {
    reply: `现在是 ${dateStr}，有什么我可以帮你的？`,
    action: 'none',
  };
}

async function handleAIChat(message, sessionId) {
  const brain = getBrain();
  const db = getDb();

  try {
    const history = db.getMessages(sessionId, 10);
    const result = await brain.chat(message, history);
    if (!result) throw new Error('brain returned null');
    db.saveMessage(sessionId, 'assistant', result.message);

    // If AI wants to play track(s), resolve them
    if (result.action === 'play') {
      if (result.data?.trackNames && result.data.trackNames.length > 1) {
        // Multiple tracks — resolve all in parallel
        const resolved = await Promise.all(
          result.data.trackNames.map(tn => {
            const kw = tn.artist ? `${tn.trackName} ${tn.artist}` : tn.trackName;
            return resolveTrack(kw);
          })
        );
        const valid = resolved.filter(Boolean);
        if (valid.length > 0) {
          result.data.tracks = valid;
          result.data.track = valid[0];
        }
      } else if (result.data?.trackName) {
        // Single track — legacy path
        const keyword = result.data.artist
          ? `${result.data.trackName} ${result.data.artist}`
          : result.data.trackName;
        const track = await resolveTrack(keyword);
        if (track) result.data.track = track;
      }
    }

    // If AI wants to recommend, search for matching tracks
    if (result.action === 'recommend' && result.data?.style) {
      const music = getMusic();
      let tracks = await searchWithFallback(result.data.style, 3);
      if (tracks && tracks.length > 0) {
        // Resolve ALL tracks' URLs in parallel
        await Promise.all(tracks.map(async (t) => {
          const url = await music.getTrackUrl(t.id);
          if (url) t.url = url;
        }));
        result.data.tracks = tracks;
        result.data.track = tracks[0];
      }
    }

    return {
      reply: result.message,
      action: result.action,
      data: result.data,
    };
  } catch (err) {
    console.error('[router] AI chat failed:', err.message);
    // If it looks like an auth/config issue, give a clearer hint
    const hint = (err.message || '').includes('null')
      ? '（AI 服务未连接，请检查 ANTHROPIC_API_KEY 配置）'
      : '';
    return {
      reply: `Claudio 暂时无法深度回应${hint}。不过你仍然可以说"播放"加歌名来点歌，或者说"推荐"来发现新音乐。`,
      action: 'none',
    };
  }
}

// ─── Track Handler ──────────────────────────────────

async function getNextTrack() {
  const music = getMusic();
  const db = getDb();
  const tasteHint = readTasteHint();
  const recent = db.recentlyPlayed();  // avoid repeating recently played tracks

  const tracks = await music.recommend(tasteHint);

  if (tracks && tracks.length > 0) {
    // Pick the first track not recently played, or fall back to the first one
    let track = tracks.find(t => !recent.includes(String(t.id)));
    if (!track) track = tracks[0];

    const url = await music.getTrackUrl(track.id);
    if (url) track.url = url;

    db.addPlayHistory({
      id: track.id,
      title: track.name,
      artist: track.ar?.[0]?.name || '未知艺人',
      album: track.al?.name,
      cover_url: track.al?.picUrl,
    });
    return { track };
  }
  return { track: null };
}

// ─── WebSocket Handler ──────────────────────────────

async function handleWs(ws, type, payload) {
  switch (type) {
    case 'chat':
      const result = await handleChat(payload);
      // Send text reply immediately
      ws.send(JSON.stringify({ type: 'chat.reply', payload: result }));
      // Synthesize TTS in background, send when ready
      if (result?.reply) {
        const voice = payload.edgeVoice || process.env.TTS_VOICE_CHAT || 'zh-CN-YunxiNeural';
        synthesizeAndSend(ws, result.reply, voice);
      }
      break;

    case 'next':
      const track = await getNextTrack();
      ws.send(JSON.stringify({ type: 'track.change', payload: track }));
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', payload: { message: `unknown type: ${type}` } }));
  }
}

// Synthesize TTS and send audio URL to client when ready
function synthesizeAndSend(ws, text, voice) {
  const tts = require('./VOICE/tts');
  const v = voice || process.env.TTS_VOICE_CHAT || 'zh-CN-YunxiNeural';
  tts.synthesize(text, v).then(audioPath => {
    if (audioPath && ws.readyState === 1) {
      const audioUrl = tts.getAudioUrl(audioPath);
      ws.send(JSON.stringify({ type: 'tts.play', payload: { text, audioUrl } }));
    }
  }).catch(() => {});
}

// ─── Track Resolver ──────────────────────────────

async function resolveTrack(keyword) {
  const music = getMusic();
  const db = getDb();

  const tracks = await music.search(keyword, 1);
  if (tracks && tracks.length > 0) {
    const track = tracks[0];
    const url = await music.getTrackUrl(track.id);
    if (url) track.url = url;

    db.addPlayHistory({
      id: track.id,
      title: track.name,
      artist: track.ar?.[0]?.name || '未知艺人',
      album: track.al?.name,
      cover_url: track.al?.picUrl,
    });
    return track;
  }
  return null;
}

async function getLyric(trackId) {
  const music = getMusic();
  return music.getLyric(trackId);
}

module.exports = {
  handleChat,
  getNextTrack,
  resolveTrack,
  getLyric,
  handleWs,
};
