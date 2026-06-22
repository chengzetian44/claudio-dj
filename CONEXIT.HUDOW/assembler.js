// Prompt Assembler — builds Claude prompts from USER/ corpus + dj-persona.md

const fs = require('fs');
const path = require('path');

const USER_DIR = path.join(__dirname, '..', 'USER');
const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_) {
    return '';
  }
}

function getNowString() {
  return new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit',
  });
}

// ─── System prompt (persona + static context) ──────

function buildSystemPrompt() {
  const persona = readFileSafe(path.join(PROMPTS_DIR, 'dj-persona.md'));
  const taste = readFileSafe(path.join(USER_DIR, 'taste.md'));
  const routines = readFileSafe(path.join(USER_DIR, 'routines.md'));
  const rules = readFileSafe(path.join(USER_DIR, 'good-rules.md'));

  // Recent likes and skips
  let memoryStr = '';
  try {
    const db = require('../STATE.DB.js');
    db.init();
    const likes = db.getLikes(10);
    const skips = db.getSkips(10);
    if (likes.length > 0) {
      memoryStr += '\n用户最近喜欢的歌曲：\n';
      memoryStr += likes.map(l => `- ${l.title} - ${l.artist}`).join('\n');
    }
    if (skips.length > 0) {
      memoryStr += '\n用户最近跳过的歌曲：\n';
      memoryStr += skips.map(s => `- ${s.title} - ${s.artist}`).join('\n');
    }
  } catch (_) {}

  return [
    persona,
    '\n---\n',
    '## 当前时间',
    getNowString(),
    '\n---\n',
    '## 用户品味档案',
    taste,
    '\n---\n',
    '## 用户日常流程',
    routines,
    '\n---\n',
    '## 行为规则',
    rules,
    memoryStr,
  ].join('\n');
}

// ─── User prompt (message + history) ────────────────

function buildUserPrompt(message, history = []) {
  let historyStr = '';
  if (history.length > 0) {
    historyStr = '\n## 最近对话\n';
    for (const msg of history) {
      historyStr += `- ${msg.role === 'user' ? '用户' : 'Claudio'}: ${msg.content.slice(0, 200)}\n`;
    }
  }

  return [
    historyStr ? historyStr.trim() : '',
    '\n## 用户消息',
    message,
  ].join('\n');
}

// Legacy combined prompt
function buildPrompt(userMessage, history = []) {
  return buildSystemPrompt() + '\n\n---\n\n' + buildUserPrompt(userMessage, history);
}

module.exports = { buildPrompt, buildSystemPrompt, buildUserPrompt };
