// Chat.js — WebSocket chat UI controller

const Chat = {
  sessionId: null,
  ws: null,
  reconnectTimer: null,
  voiceName: null,

  init() {
    this.voiceName = localStorage.getItem('tts_voice') || '';

    // Restore previous session or create new one
    const savedId = localStorage.getItem('claudio_session');
    if (savedId) {
      this.sessionId = savedId;
      this.loadHistory(savedId);
    } else {
      this.newSession();
    }

    this.connectWs();

    document.getElementById('chat-send').addEventListener('click', () => this.send());
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send();
    });
    document.getElementById('chat-new').addEventListener('click', () => {
      localStorage.removeItem('claudio_session');
      this.newSession();
    });
  },

  newSession() {
    fetch('/api/new')
      .then(r => r.json())
      .then(d => {
        this.sessionId = d.sessionId;
        localStorage.setItem('claudio_session', d.sessionId);
        document.getElementById('chat-messages').innerHTML = `
          <div class="chat-msg assistant">
            <div class="msg-content">晚上好，我是 Claudio。想听点什么？</div>
          </div>`;
      });
  },

  async loadHistory(sessionId) {
    try {
      const res = await fetch('/api/history?sessionId=' + encodeURIComponent(sessionId));
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        data.messages.forEach(msg => {
          this.addMessage(msg.role, msg.content);
        });
        return;
      }
    } catch (_) { Toast.error('加载聊天记录失败'); }
    // If history is empty or failed, show default
    document.getElementById('chat-messages').innerHTML = `
      <div class="chat-msg assistant">
        <div class="msg-content">晚上好，我是 Claudio。想听点什么？</div>
      </div>`;
  },

  connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/stream`);

    this.ws.onopen = () => {
      console.log('[chat] ws connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        if (type === 'chat.reply') {
          this.hideTyping();
          const text = payload.reply || payload.message;
          this.addMessage('assistant', text);
          // Queue tracks now, defer first track until TTS audio arrives
          this.handleReplyPayload(payload);
        } else if (type === 'track.change' && payload?.track) {
          Player.load(payload.track);
        } else if (type === 'schedule.alert') {
          this.addMessage('assistant', '📻 ' + payload.message);
          this.speakThenPlay(payload.message, payload);
        } else if (type === 'tts.play' && payload.text) {
          this.speakThenPlay(payload.text, payload);
        }
      } catch (_) { /* non-critical: malformed WS message */ }
    };

    this.ws.onclose = () => {
      console.log('[chat] ws closed, reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connectWs(), 5000);
    };
  },

  // Queue tracks and show list from chat.reply payload; defer first track play
  handleReplyPayload(payload) {
    var tracks = payload.data?.tracks;
    var track = payload.data?.track;

    // Enqueue tracks 2..N (track 1 plays separately)
    if (tracks && tracks.length > 1) {
      Player.enqueue(tracks.slice(1));
      this.showTrackList(tracks);
    }

    // Store first track — tts.play will pick it up and play after voice
    this._pendingTrack = track || null;
    if (this._trackTimer) clearTimeout(this._trackTimer);

    // Fallback: if tts.play never arrives (TTS failed), play track after 5s
    if (track) {
      var self = this;
      this._trackTimer = setTimeout(function() {
        if (self._pendingTrack) {
          Player.load(self._pendingTrack);
          self._pendingTrack = null;
        }
      }, 5000);
    }
  },

  // Speak text via server-generated TTS audio, then play pending track
  speakThenPlay(text, payload) {
    var track = payload.data?.track || this._pendingTrack;
    var tracks = payload.data?.tracks;
    var audioUrl = payload.audioUrl;

    // Clear fallback timer since we got here (tts.play arrived)
    if (this._trackTimer) { clearTimeout(this._trackTimer); this._trackTimer = null; }

    // Enqueue if track list present (schedule.alert may have tracks)
    if (tracks && tracks.length > 1) {
      Player.enqueue(tracks.slice(1));
      this.showTrackList(tracks);
    }

    // No text — play track directly
    if (!text) {
      if (track) { this._pendingTrack = null; Player.load(track); }
      return;
    }

    // Server TTS audio — use persistent element (blessed with music on first tap)
    if (audioUrl) {
      var tts = Player.ttsAudio;
      if (tts) {
        tts.src = audioUrl;
        tts.load();
        tts.play().catch(function() {});
      }
      if (track) {
        this._pendingTrack = null;
        setTimeout(function() { Player.load(track); }, 1500);
      }
      return;
    }

    // No audio URL — TTS unavailable, just play track
    if (track) {
      this._pendingTrack = null;
      Player.load(track);
    }
  },

  setVoice(name) {
    this.voiceName = name;
    localStorage.setItem('tts_voice', name);
  },

  send() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    this.addMessage('user', text);
    this.showTyping();
    input.value = '';

    const edgeVoice = localStorage.getItem('edge_voice') || '';

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat',
        payload: { message: text, sessionId: this.sessionId, edgeVoice: edgeVoice },
      }));
    } else {
      // Fallback to HTTP
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: this.sessionId }),
      })
        .then(r => r.json())
        .then(data => {
          this.hideTyping();
          this.addMessage('assistant', data.reply || data.message);
          // HTTP fallback: no TTS, play track directly
          if (data.data?.tracks && data.data.tracks.length > 1) {
            Player.enqueue(data.data.tracks.slice(1));
            this.showTrackList(data.data.tracks);
          }
          if (data.data?.track) {
            Player.load(data.data.track);
          }
        })
        .catch(() => {
          this.hideTyping();
          this.addMessage('assistant', '抱歉，我暂时无法回应。请稍后再试。');
        });
    }
  },

  addMessage(role, content) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.innerHTML = `<div class="msg-content">${this.escapeHtml(content)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  showTyping() {
    this.hideTyping(); // remove any existing one
    var container = document.getElementById('chat-messages');
    var el = document.createElement('div');
    el.className = 'chat-msg assistant typing-msg';
    el.innerHTML = '<div class="typing-indicator"><span>Claudio 正在思考</span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  },

  hideTyping() {
    var el = document.querySelector('.typing-msg');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  showTrackList(tracks) {
    var lines = tracks.map(function(t, i) {
      var artist = (t.ar && t.ar[0] ? t.ar[0].name : '') || t.artist || '?';
      return (i + 1) + '. ' + artist + ' — ' + (t.name || t.title || '?');
    });
    this.addMessage('assistant', '🎵 即将播放：\n' + lines.join('\n'));
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
