// Music service — NeteaseCloudMusicApi direct integration

const path = require('path');
const fs = require('fs');

let neteaseReady = false;
let netease = null;

function init() {
  if (neteaseReady) return;
  try {
    netease = require('NeteaseCloudMusicApi');
    neteaseReady = true;
    console.log('[music] NeteaseCloudMusicApi loaded');
  } catch (err) {
    console.error('[music] failed to load NeteaseCloudMusicApi:', err.message);
  }
}

async function call(fn, data = {}) {
  init();
  if (!neteaseReady) return null;
  try {
    const result = await netease[fn]({
      ...data,
      cookie: process.env.NETEASE_COOKIE || '',
      realIP: '',
    });
    return result.body;
  } catch (err) {
    console.error(`[music] ${fn} error:`, err.message);
    return null;
  }
}

// ─── Public API ────────────────────────────────────

async function search(keyword, limit = 10) {
  // Try cloudsearch first (better ranking), fallback to regular search
  let res = await call('cloudsearch', { keywords: keyword, limit, type: 1 });
  if (!res || !res.result || !res.result.songs) {
    res = await call('search', { keywords: keyword, limit, type: 1 });
  }
  if (!res || !res.result || !res.result.songs) return [];

  const tracks = res.result.songs.map(s => ({
    id: String(s.id),
    name: s.name,
    ar: filterArtists((s.ar || []).map(a => ({ ...a, name: cleanArtistName(a.name) }))),
    al: s.al || {},
    dt: s.dt,
    score: 0,
  }));

  // Score and rank to prefer original versions
  return rankTracks(tracks, keyword).slice(0, 5);
}

// ─── Helpers ───────────────────────────────────────

function cleanArtistName(name) {
  if (!name) return '';
  // Strip remix/DJ suffixes
  let cleaned = name.replace(/[-/.]+[A-Z][a-zA-Z]*$/, '');
  cleaned = cleaned.replace(/[-/.]+$/g, '');
  return cleaned.trim() || name;
}

function filterArtists(artists) {
  if (!artists || artists.length <= 1) return artists;
  // If we have a mix of Chinese artists and Latin remixers, keep only the original artists
  const hasChinese = artists.some(a => /[一-鿿]/.test(a.name));
  if (hasChinese) {
    return artists.filter(a => /[一-鿿]/.test(a.name));
  }
  return artists;
}

// ─── Smart Ranking ─────────────────────────────────

function rankTracks(tracks, keyword) {
  const kw = keyword.toLowerCase();

  for (const t of tracks) {
    let score = 0;
    const name = (t.name || '').toLowerCase();
    const artists = (t.ar || []).map(a => (a.name || '').toLowerCase());
    const artistStr = artists.join(' ');

    // Artist mentioned in keyword — strong signal
    for (const a of artists) {
      if (kw.includes(a) || a.includes(kw)) score += 20;
    }

    // Prefer tracks without remix/DJ markers in artist
    const cleanArtists = t.ar.filter(a => {
      const n = a.name || '';
      return !n.includes('/') && !n.includes('.') && !n.includes('-') && !n.includes('Montagem');
    });
    score += cleanArtists.length * 5;

    // Penalize cover/remix indicators in track name
    const coverMarkers = ['原唱', '翻唱', '女声', '男声', '正式版', '深情版',
                          'cover', 'remix', 'bootleg', 'edit'];
    for (const m of coverMarkers) {
      if (name.includes(m.toLowerCase())) score -= 15;
    }

    // Penalize tracks with bracket decorations
    if (/[\(（].*[\)）]/.test(t.name)) score -= 5;

    // Prefer longer tracks (originals tend to be 3-5 min, remixes vary)
    if (t.dt && t.dt > 180000 && t.dt < 360000) score += 3;

    // Known major artists bonus
    const majorArtists = ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋', 'Taylor Swift',
                          'Adele', 'Coldplay', 'Ed Sheeran'];
    for (const a of (t.ar || [])) {
      if (majorArtists.some(m => (a.name || '').includes(m))) score += 8;
    }

    t.score = score;
  }

  // Sort by score descending
  tracks.sort((a, b) => b.score - a.score);
  return tracks;
}

async function getTrackUrl(trackId) {
  const res = await call('song_url_v1', { id: trackId, level: 'standard' });
  if (res && res.data && res.data[0] && res.data[0].url) {
    return res.data[0].url;
  }
  return null;
}

async function getLyric(trackId) {
  const res = await call('lyric_new', { id: trackId });
  if (res && res.lrc) {
    return res.lrc.lyric || '';
  }
  return '';
}

async function recommend(tasteHint) {
  init();
  if (!neteaseReady) return search('推荐');

  try {
    const res = await call('recommend_songs');
    if (res && res.data && res.data.dailySongs) {
      return res.data.dailySongs.slice(0, 5).map(s => ({
        id: String(s.id),
        name: s.name,
        ar: s.ar || [],
        al: s.al || {},
        dt: s.dt,
      }));
    }
  } catch (_) {}

  const styles = extractStyles(tasteHint);
  if (styles.length > 0) {
    const style = styles[Math.floor(Math.random() * styles.length)];
    return search(style);
  }

  return search('推荐歌单');
}

function extractStyles(tasteHint) {
  const styles = [];
  const lines = tasteHint.split('\n');
  for (const line of lines) {
    const match = line.match(/[-*]\s*(.+)/);
    if (match) {
      styles.push(match[1].trim().split('/')[0].trim());
    }
  }
  return styles;
}

module.exports = { search, getTrackUrl, getLyric, recommend };
