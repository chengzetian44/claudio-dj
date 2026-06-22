// Event Scheduler — cron-based time-triggered tasks
// Phase 7: Morning plan, morning briefing, hourly checks

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

let broadcastFn = null;
let stateDb = null;
let brain = null;

function getDb() {
  if (!stateDb) {
    stateDb = require('./STATE.DB.js');
    stateDb.init();
  }
  return stateDb;
}

function getBrain() {
  if (!brain) brain = require('./BRAIN/claude.js');
  return brain;
}

function getTaste() {
  try {
    return fs.readFileSync(path.join(__dirname, 'USER', 'taste.md'), 'utf-8').slice(0, 500);
  } catch (_) { return ''; }
}

function getRoutines() {
  try {
    return fs.readFileSync(path.join(__dirname, 'USER', 'routines.md'), 'utf-8').slice(0, 500);
  } catch (_) { return ''; }
}

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function today() {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

function broadcast(type, payload) {
  if (broadcastFn) broadcastFn(type, payload);
}

async function speakAndBroadcast(message, action = 'briefing', voice) {
  // Broadcast text first
  broadcast('schedule.alert', { message, time: now(), action });

  // Try TTS with scene-specific voice
  try {
    const tts = require('./VOICE/tts');
    const audioPath = await tts.synthesize(message, voice);
    if (audioPath) {
      const audioUrl = tts.getAudioUrl(audioPath);
      broadcast('tts.play', { audioUrl, text: message });
    }
  } catch (_) {}
}

// ─── Task: Morning Plan (07:00) ────────────────────

async function morningPlan() {
  console.log('[scheduler] morning plan triggered');
  const db = getDb();
  const plans = db.getTodayPlans();

  let msg;
  if (plans.length > 0) {
    const list = plans.map(p => `- ${p.time || ''} ${p.title}`).join('\n');
    msg = `早上好！今天是 ${today()}。\n你今天的计划：\n${list}\n要我来点晨间音乐吗？`;
  } else {
    msg = `早上好！今天是 ${today()}。今天没有特别的日程安排，先来一段轻音乐开始新的一天吧。`;
  }

  const sessionId = db.createSession();
  db.saveMessage(sessionId, 'assistant', msg);

  speakAndBroadcast(msg, 'morning_plan', process.env.TTS_VOICE_BRIEFING || 'zh-CN-YunyangNeural');

  // Also push a music recommendation
  try {
    const music = require('./MUSIC/netease');
    const tracks = await music.search('早晨 轻快');
    if (tracks && tracks.length > 0) {
      const track = tracks[0];
      const url = await music.getTrackUrl(track.id);
      if (url) track.url = url;
      broadcast('track.change', { track });
    }
  } catch (_) {}
}

// ─── Task: Morning Briefing (09:00) ────────────────

async function morningBriefing() {
  console.log('[scheduler] morning briefing triggered');
  const db = getDb();

  // Try AI-generated briefing first
  try {
    const brain = getBrain();
    const taste = getTaste();
    const routines = getRoutines();
    const plans = db.getTodayPlans();

    // Get real weather
    let weatherStr = '';
    try {
      const weather = require('./VOICE/weather');
      const w = await weather.getWeatherSummary();
      weatherStr = `天气：${w.summary}，体感${w.vibe}`;
    } catch (_) {}

    const prompt = [
      `当前时间：${today()} ${now()}`,
      weatherStr,
      plans.length > 0
        ? `今日计划：${plans.map(p => p.title).join('、')}`
        : '今日暂无特别计划。',
      `用户品味：${taste.slice(0, 300)}`,
      `请以 Claudio DJ 的身份，生成一段 2-3 句话的早间播报。`,
      `内容包含：时间天气氛围 + 今日计划提醒 + 推荐当前时段适合的音乐风格。`,
      `请以 JSON 格式回复：{"message":"播报内容","action":"recommend","data":{"style":"推荐风格"}}`,
    ].join('\n');

    const result = await brain.chat(prompt, []);
    if (result && result.message) {
      const sessionId = db.createSession();
      db.saveMessage(sessionId, 'assistant', result.message);
      speakAndBroadcast(result.message, 'briefing', process.env.TTS_VOICE_BRIEFING || 'zh-CN-YunyangNeural');
      return;
    }
  } catch (_) {}

  // Fallback briefing
  const msg = `上午好！现在是 ${today()} ${now()}。工作时段，来点背景电子音乐帮你集中注意力。今天有什么特别的事需要我帮你记下吗？`;
  const sessionId = db.createSession();
  db.saveMessage(sessionId, 'assistant', msg);
  broadcast('schedule.alert', { message: msg, time: '09:00', action: 'briefing' });
}

// ─── Task: Hourly Check ────────────────────────────

async function hourlyCheck() {
  const hour = new Date().getHours();

  // Skip overnight hours (23:00-06:00) to avoid disturbance
  if (hour >= 23 || hour < 7) return;

  console.log('[scheduler] hourly check:', hour);
  const db = getDb();

  const plans = db.getTodayPlans();
  const pending = plans.filter(p => p.status === 'pending');

  if (pending.length > 0 && (hour === 10 || hour === 14 || hour === 16)) {
    const msg = `提醒一下，还有 ${pending.length} 项待办：${pending.map(p => p.title).join('、')}`;
    db.createSession();
    broadcast('schedule.alert', { message: msg, time: `${hour}:00`, action: 'reminder' });
  }

  // Save hourly context
  db.setContext('last_hourly_check', String(hour));
}

// ─── Init ──────────────────────────────────────────

function init(broadcastFunc) {
  broadcastFn = broadcastFunc;

  // 07:00 daily — Morning Plan
  cron.schedule('0 7 * * *', () => {
    morningPlan().catch(e => console.error('[scheduler] plan error:', e.message));
  }, { timezone: 'Asia/Shanghai' });

  // 09:00 daily — Morning Briefing
  cron.schedule('0 9 * * *', () => {
    morningBriefing().catch(e => console.error('[scheduler] briefing error:', e.message));
  }, { timezone: 'Asia/Shanghai' });

  // Hourly check
  cron.schedule('0 * * * *', () => {
    hourlyCheck().catch(e => console.error('[scheduler] hourly error:', e.message));
  }, { timezone: 'Asia/Shanghai' });

  console.log('[scheduler] tasks registered: 07:00 plan, 09:00 briefing, hourly check');
  console.log('[scheduler] timezone: Asia/Shanghai');
}

module.exports = { init, morningPlan, morningBriefing, hourlyCheck };
