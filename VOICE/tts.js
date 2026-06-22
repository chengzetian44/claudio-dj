// Voice synthesizer — Microsoft Edge TTS (free neural voices)
// Uses edge-tts Python CLI: pip install edge-tts
// Available voices:
//   Male:   YunxiNeural(温暖) YunjianNeural(活泼) YunyangNeural(新闻) YunfengNeural(成熟) YunhaoNeural(明亮)
//   Female: XiaoxiaoNeural(温柔) XiaoyiNeural(知性) XiaochenNeural(可爱)

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TTS_DIR = path.join(__dirname, '..', 'tts');
const DEFAULT_VOICE = process.env.TTS_VOICE || 'zh-CN-YunxiNeural';
const RATE = process.env.TTS_RATE || '+10%';

// ─── Ensure cache dir exists ────────────────────────

function ensureDir() {
  if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });
}

function getCachePath(text, voice) {
  const key = text + (voice || DEFAULT_VOICE) + RATE;
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return path.join(TTS_DIR, `${hash}.mp3`);
}

// ─── Edge TTS via Python CLI ────────────────────────

function edgeTts(text, voice, outputPath) {
  return new Promise((resolve, reject) => {
    const v = voice || DEFAULT_VOICE;
    const args = [
      '-m', 'edge_tts',
      '--text', text,
      '--voice', v,
      '--rate', RATE,
      '--write-media', outputPath,
    ];

    const child = execFile('python', args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`edge-tts: ${stderr.trim() || err.message}`));
        return;
      }
      resolve(outputPath);
    });

    // Suppress stdout (diagnostic info from edge-tts)
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
  });
}

// ─── Public API ────────────────────────────────────

async function synthesize(text, voice) {
  ensureDir();
  const v = voice || DEFAULT_VOICE;
  const cachePath = getCachePath(text, v);

  // Return cached file if exists
  if (fs.existsSync(cachePath)) {
    console.log('[tts] cache hit:', path.basename(cachePath), `(${v})`);
    return cachePath;
  }

  try {
    console.log('[tts] synthesizing via Edge TTS...', `(${v})`);
    await edgeTts(text, v, cachePath);
    const size = fs.statSync(cachePath).size;
    console.log('[tts] synthesized:', path.basename(cachePath), `(${(size / 1024).toFixed(1)} KB)`);
    return cachePath;
  } catch (err) {
    console.error('[tts] synthesis failed:', err.message);
    return null;
  }
}

// Serve a local TTS file path as URL relative to server
function getAudioUrl(filePath) {
  if (!filePath) return null;
  const filename = path.basename(filePath);
  return `/tts/${filename}`;
}

module.exports = { synthesize, getAudioUrl };
