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
          // Speak the reply, then play song if there's a track
          this.speakThenPlay(text, payload);
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

  // Speak text via browser TTS or server-generated audio, then optionally play a track
  speakThenPlay(text, payload) {
    const track = payload.data?.track;
    const tracks = payload.data?.tracks;
    const audioUrl = payload.audioUrl;

    // Enqueue all but the first track (first plays immediately)
    if (tracks && tracks.length > 1) {
      Player.enqueue(tracks.slice(1));
      this.showTrackList(tracks);
    }

    // If no text to speak but there's a track, play it directly
    if (!text) {
      if (track) Player.load(track);
      return;
    }

    // Server-generated audio (works on mobile!) — play via Audio element
    if (audioUrl) {
      var audio = new Audio(audioUrl);
      audio.play().catch(function() {});
      // Still play the track after a short delay
      if (track) {
        setTimeout(function() { Player.load(track); }, 1200);
      }
      return;
    }

    // Fallback: browser speechSynthesis (desktop only, unreliable on mobile)
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.1;
    u.pitch = 1.0;
    u.volume = 0.8;

    // Use user's selected voice if available
    if (this.voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.name === this.voiceName);
      if (match) u.voice = match;
    }

    // Start playing immediately — don't wait for TTS to finish
    if (track) {
      // Small delay so voice has a moment to start before music
      setTimeout(() => Player.load(track), 800);
    }

    window.speechSynthesis.speak(u);
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

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat',
        payload: { message: text, sessionId: this.sessionId },
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
          // Enqueue multi-track recommendations
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
