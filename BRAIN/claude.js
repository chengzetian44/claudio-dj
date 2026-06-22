// AI Brain — Claude API integration
// Primary: @anthropic-ai/sdk (direct API)
// Fallback: Claude Code CLI subprocess

const path = require('path');

const ASSEMBLER_PATH = path.join(__dirname, '..', 'CONEXIT.HUDOW', 'assembler.js');

async function chat(message, history = []) {
  const assembler = require(ASSEMBLER_PATH);
  const systemPrompt = assembler.buildSystemPrompt();
  const userPrompt = assembler.buildUserPrompt(message, history);

  // Try SDK first if any auth token is available
  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
    const result = await chatViaSDK(systemPrompt, userPrompt);
    if (result) return result;
  }

  // Fallback to CLI subprocess
  const result = await chatViaCLI(systemPrompt, userPrompt);
  if (result) return result;

  return null;
}

// ─── SDK Mode ──────────────────────────────────────

async function chatViaSDK(systemPrompt, userPrompt) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');

    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN
      || process.env.ANTHROPIC_API_KEY
      || '';

    const config = {};
    if (apiKey) config.apiKey = apiKey;
    if (process.env.ANTHROPIC_BASE_URL) config.baseURL = process.env.ANTHROPIC_BASE_URL;

    const anthropic = new Anthropic(config);

    const model = process.env.ANTHROPIC_MODEL
      || process.env.CLAUDE_MODEL
      || 'claude-sonnet-4-6';

    // DeepSeek reasoning models (deepseek-v4-pro, etc.) need extra tokens
    // for their thinking phase — 4096 is often exhausted before text output.
    const isDeepSeek = (process.env.ANTHROPIC_BASE_URL || '').includes('deepseek');
    const maxTokens = isDeepSeek ? 8192 : 4096;

    const msg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Prefer text blocks; skip thinking / reasoning blocks
    const text = msg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    if (!text) {
      console.warn('[brain:sdk] No text content returned — '
        + `content types: [${msg.content.map(c => c.type).join(', ')}], `
        + `stop_reason: ${msg.stop_reason}`);
    }

    return parseResponse(text);
  } catch (err) {
    console.error('[brain:sdk]', err.message);
    return null;
  }
}

// ─── CLI Subprocess Mode ───────────────────────────

async function chatViaCLI(systemPrompt, userPrompt) {
  const { spawn } = require('child_process');

  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  return new Promise((resolve) => {
    const child = spawn('claude', [
      '--print',
      '--output-format', 'text',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      env: { ...process.env },
    });

    let stdout = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(parseResponse(stdout.trim()));
      } else {
        resolve(null);
      }
    });

    child.on('error', (err) => {
      console.error('[brain:cli]', err.message);
      resolve(null);
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

// ─── Response Parser ───────────────────────────────

function parseResponse(text) {
  // Try JSON first (legacy format)
  try {
    const json = JSON.parse(text);
    return {
      message: json.message || text,
      action: json.action || 'none',
      data: json.data || {},
    };
  } catch (_) {}

  // Parse natural language with action markers
  // ♪play:歌名:歌手名 | ♪recommend:风格 | ♪schedule:事项
  const playPattern = /♪play:(.+?):(.+?)(?:\n|$)/g;
  const playMatches = [...text.matchAll(playPattern)];
  const recommendMatch = text.match(/♪recommend:(.+?)(?:\n|$)/);
  const scheduleMatch = text.match(/♪schedule:(.+?)(?:\n|$)/);

  // Strip markers from display text
  let cleanText = text.replace(/♪(play|recommend|schedule):.+/g, '').trim();

  if (playMatches.length > 0) {
    const trackNames = playMatches.map(m => ({
      trackName: m[1].trim(),
      artist: m[2].trim(),
    }));
    // Single track → use legacy format for backward compat
    if (trackNames.length === 1) {
      return {
        message: cleanText,
        action: 'play',
        data: { trackName: trackNames[0].trackName, artist: trackNames[0].artist },
      };
    }
    // Multiple tracks → new format
    return {
      message: cleanText,
      action: 'play',
      data: { trackNames },
    };
  }
  if (recommendMatch) {
    return {
      message: cleanText,
      action: 'recommend',
      data: { style: recommendMatch[1].trim() },
    };
  }
  if (scheduleMatch) {
    return {
      message: cleanText,
      action: 'schedule',
      data: { item: scheduleMatch[1].trim() },
    };
  }

  return {
    message: text.trim(),
    action: 'none',
  };
}

module.exports = { chat };
