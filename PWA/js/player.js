// Player.js — Audio playback controller

const Player = {
  audio: null,
  currentTrack: null,
  isPlaying: false,
  lyrics: [],
  playHistory: [],  // stack for prev() — max 20
  queue: [],        // upcoming tracks
  audioUnlocked: false,
  pendingPlayTrack: null,  // track waiting for user gesture to play
  playPending: false,       // track loaded but not yet played (mobile: wait for tap)
  hasEverPlayed: false,     // once true, auto-play is allowed on mobile
  ttsAudio: null,           // persistent TTS audio element

  init() {
    this.audio = document.getElementById('audio-element');
    this.ttsAudio = document.getElementById('tts-audio');

    // ── Mobile Audio Unlock ──────────────────────────
    // Mobile browsers block audio.play() unless triggered by user gesture.
    // We unlock the audio subsystem on the first touch/click using Web Audio API —
    // the standard, battle-tested approach that doesn't interfere with <audio> src.
    var unlockHandler = () => {
      if (this.audioUnlocked) return;
      console.log('[player] attempting audio unlock via AudioContext...');
      this.audioUnlocked = true;

      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          var ctx = new AudioCtx();
          // Resume the context (brings audio system out of suspended state)
          ctx.resume().then(function() {
            // Play a silent buffer to fully wake the audio pipeline
            var buf = ctx.createBuffer(1, 1, 22050);
            var src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
            src.onended = function() { ctx.close(); };
            console.log('[player] audio subsystem unlocked');
          }).catch(function() {});
        }
      } catch(e) { /* ignore */ }

    };
    document.addEventListener('click', unlockHandler, { once: true });
    document.addEventListener('touchend', unlockHandler, { once: true });

    document.getElementById('btn-play').addEventListener('click', () => this.toggle());
    document.getElementById('btn-next').addEventListener('click', () => this.next());
    document.getElementById('btn-prev').addEventListener('click', () => this.prev());
    document.getElementById('btn-like').addEventListener('click', () => this.like());
    document.getElementById('btn-skip').addEventListener('click', () => this.skip());

    const slider = document.getElementById('volume-slider');
    this.audio.volume = slider.value / 100;
    slider.addEventListener('input', (e) => {
      this.audio.volume = e.target.value / 100;
    });

    const progressBar = document.getElementById('progress-bar');
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      this.audio.currentTime = pct * (this.audio.duration || 0);
    });

    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('loadedmetadata', () => {
      document.getElementById('time-total').textContent = this.fmt(this.audio.duration);
    });

    // Handle audio errors
    this.audio.addEventListener('error', () => {
      this.isPlaying = false;
      document.getElementById('btn-play').innerHTML = '&#9654;';
      document.getElementById('track-title').textContent = '播放失败';
      document.getElementById('track-artist').textContent = '请尝试其他歌曲';
    });

    // Media Session API — lock screen / notification controls
    if ('mediaSession' in navigator) {
      var self = this;
      navigator.mediaSession.setActionHandler('play', function() { self.play(); });
      navigator.mediaSession.setActionHandler('pause', function() { self.pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', function() { self.prev(); });
      navigator.mediaSession.setActionHandler('nexttrack', function() { self.next(); });
    }
  },

  load(track) {
    if (!track) return;

    // If no URL provided, try to resolve via API first
    if (!track.url && (track.name || track.title)) {
      this.resolveAndPlay(track.name || track.title, track.ar?.[0]?.name || track.artist);
      return;
    }
    if (!track.url) return;

    // Push current track to history before replacing it
    if (this.currentTrack && this.currentTrack.url && this.currentTrack.url !== track.url) {
      this.playHistory.push(this.currentTrack);
      if (this.playHistory.length > 20) this.playHistory.shift();
    }

    // Show loading state on cover
    var cover = document.getElementById('cover-art');
    cover.classList.add('cover-loading');

    this.currentTrack = track;
    this.audio.src = track.url;
    this.audio.load();

    document.getElementById('track-title').textContent = track.name || track.title || '未知歌曲';
    var artist = track.ar ? track.ar[0]?.name : (track.artist || '未知艺人');
    document.getElementById('track-artist').textContent = artist;

    var picUrl = track.al?.picUrl || track.cover_url;
    if (picUrl) {
      cover.innerHTML = '<img src="' + picUrl + '" alt="cover" onload="document.getElementById(\'cover-art\').classList.remove(\'cover-loading\')" onerror="this.parentElement.innerHTML=\'<div class=cover-placeholder>&#9835;</div>\';this.parentElement.classList.remove(\'cover-loading\')">';
    } else {
      cover.innerHTML = '<div class="cover-placeholder">&#9835;</div>';
      cover.classList.remove('cover-loading');
    }

    // Reset like button
    const likeBtn = document.getElementById('btn-like');
    if (likeBtn) likeBtn.classList.remove('liked');
    if (likeBtn) likeBtn.innerHTML = '&#9825;';

    this.fetchLyric(track.id || '');

    // Update Media Session metadata
    if ('mediaSession' in navigator) {
      var meta = {
        title: track.name || track.title || '未知歌曲',
        artist: (track.ar ? track.ar[0]?.name : null) || track.artist || '未知艺人',
        album: track.al?.name || track.album || '',
      };
      var art = track.al?.picUrl || track.cover_url;
      if (art) { meta.artwork = [{ src: art, sizes: '512x512', type: 'image/jpeg' }]; }
      navigator.mediaSession.metadata = new MediaMetadata(meta);
    }

    // Mobile: first play needs user gesture. Once hasEverPlayed is set,
    // the <audio> element is trusted and auto-play works for subsequent tracks.
    var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobile && !this.hasEverPlayed) {
      this.playPending = true;
      document.getElementById('btn-play').innerHTML = '&#9654;';
    } else {
      this.play();
    }
  },

  async like() {
    if (!this.currentTrack) return;
    const btn = document.getElementById('btn-like');
    const isLiked = btn.classList.toggle('liked');
    btn.innerHTML = isLiked ? '&#9829;' : '&#9825;';

    try {
      await fetch('/api/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: {
            id: this.currentTrack.id,
            title: this.currentTrack.name || this.currentTrack.title,
            artist: this.currentTrack.ar?.[0]?.name || this.currentTrack.artist,
          },
        }),
      });
    } catch (_) { Toast.error('收藏失败，请稍后重试'); }
  },

  async skip() {
    if (!this.currentTrack) return;
    try {
      await fetch('/api/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: {
            id: this.currentTrack.id,
            title: this.currentTrack.name || this.currentTrack.title,
            artist: this.currentTrack.ar?.[0]?.name || this.currentTrack.artist,
          },
        }),
      });
    } catch (_) { /* non-critical, proceed to next track */ }
    this.next();
  },

  async fetchLyric(trackId) {
    const el = document.getElementById('lyric-display');
    this.lyrics = [];
    if (!trackId) {
      el.innerHTML = '<p class="lyric-line">暂无歌词</p>';
      return;
    }
    try {
      const res = await fetch('/api/lyric?id=' + encodeURIComponent(trackId));
      const data = await res.json();
      if (data.lyric) {
        this.lyrics = this.parseLrc(data.lyric);
      }
    } catch (_) { /* non-critical: lyrics unavailable */ }
    if (this.lyrics.length === 0) {
      el.innerHTML = '<p class="lyric-line">暂无歌词</p>';
    } else {
      el.innerHTML = this.lyrics.map(l => `<p class="lyric-line" data-t="${l.time}">${l.text}</p>`).join('');
    }
  },

  parseLrc(lrc) {
    const lines = [];
    const regex = /\[(\d{2}):(\d{2})[.:](\d{2})\](.*)/g;
    let match;
    while ((match = regex.exec(lrc)) !== null) {
      const min = parseInt(match[1]), sec = parseInt(match[2]), ms = parseInt(match[3]);
      const text = match[4].trim();
      if (text) {
        lines.push({ time: min * 60 + sec + ms / 100, text });
      }
    }
    return lines;
  },

  updateLyric() {
    if (this.lyrics.length === 0) return;
    const t = this.audio.currentTime;
    // Find the current lyric line
    let activeIdx = -1;
    for (let i = 0; i < this.lyrics.length; i++) {
      if (this.lyrics[i].time <= t) activeIdx = i;
      else break;
    }
    const allLines = document.querySelectorAll('.lyric-line');
    allLines.forEach((el, i) => {
      el.classList.toggle('active', i === activeIdx);
      if (i === activeIdx && activeIdx > 0) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  },

  async resolveAndPlay(name, artist) {
    const keyword = artist ? `${name} ${artist}` : name;
    try {
      // Call backend to search and resolve a real track
      const res = await fetch('/api/resolve?keyword=' + encodeURIComponent(keyword));
      const data = await res.json();
      if (data.track && data.track.url) {
        this.load(data.track);
        return;
      }
    } catch (_) { Toast.error('歌曲搜索失败，请检查网络'); }
    document.getElementById('track-title').textContent = name;
    document.getElementById('track-artist').textContent = artist || '未找到可播放版本';
  },

  play() {
    var self = this;
    const promise = this.audio.play();
    if (promise) {
      promise.then(function() {
        self.hasEverPlayed = true;  // audio element now trusted on mobile
      }).catch((err) => {
        console.warn('[player] play() rejected:', err.name);
        self.isPlaying = false;
        document.getElementById('btn-play').innerHTML = '&#9654;';
        // On mobile, autoplay blocks if not from user gesture.
        // Store this track so we retry on next user tap.
        if (err.name === 'NotAllowedError') {
          self.pendingPlayTrack = self.currentTrack;
          Toast.error('轻触播放按钮开始播放');
        } else {
          Toast.error('播放失败，请尝试其他歌曲');
        }
      });
    }
    this.isPlaying = true;
    document.getElementById('btn-play').innerHTML = '&#9646;&#9646;';
  },

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    document.getElementById('btn-play').innerHTML = '&#9654;';
  },

  toggle() {
    // Mobile: playPending means track is loaded but waiting for user tap
    if (this.playPending) {
      this.playPending = false;
      // Bless the TTS audio element too (same user gesture)
      this.blessTtsAudio();
      this.play();
      return;
    }
    // If a previous play() was blocked, retry on this user gesture
    if (!this.isPlaying && this.pendingPlayTrack) {
      const t = this.pendingPlayTrack;
      this.pendingPlayTrack = null;
      this.load(t);
      return;
    }
    this.isPlaying ? this.pause() : this.play();
  },

  // Bless the TTS audio element with a silent play (unlocks it for later use)
  blessTtsAudio() {
    if (!this.ttsAudio) return;
    try {
      this.ttsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      this.ttsAudio.play().then(() => {
        this.ttsAudio.pause();
        this.ttsAudio.removeAttribute('src');
      }).catch(() => {
        this.ttsAudio.removeAttribute('src');
      });
    } catch(e) { /* ignore */ }
  },

  enqueue(tracks) {
    if (!tracks || tracks.length === 0) return;
    // Only queue tracks that have URLs (resolved by backend)
    var valid = tracks.filter(function(t) { return t && t.url; });
    this.queue = this.queue.concat(valid);
  },

  async next() {
    // Play from queue first
    if (this.queue.length > 0) {
      var queued = this.queue.shift();
      this.load(queued);
      return;
    }

    // Queue empty — fetch from server
    try {
      const res = await fetch('/api/next');
      const data = await res.json();
      if (data.track) {
        if (data.track.url) {
          this.load(data.track);
        } else if (data.track.name) {
          this.resolveAndPlay(data.track.name, data.track.ar?.[0]?.name);
        }
      }
    } catch (_) { Toast.error('获取下一首失败，请检查网络'); }
  },

  prev() {
    if (this.playHistory.length === 0) {
      // No history — restart current track
      this.audio.currentTime = 0;
      this.play();
      return;
    }
    var prevTrack = this.playHistory.pop();
    // Don't push the current track (we're going backwards)
    if (this.currentTrack && this.currentTrack.url) {
      // Temporarily remove from history so load() doesn't re-add it
      this.currentTrack = null;
    }
    this.load(prevTrack);
  },

  updateProgress() {
    const { currentTime, duration } = this.audio;
    if (duration) {
      const pct = (currentTime / duration) * 100;
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('time-current').textContent = this.fmt(currentTime);
    }
    this.updateLyric();
  },

  onEnded() {
    const autoplay = document.getElementById('toggle-autoplay');
    if (autoplay && autoplay.checked) {
      this.next();
    } else {
      this.isPlaying = false;
      document.getElementById('btn-play').innerHTML = '&#9654;';
    }
  },

  fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },
};
