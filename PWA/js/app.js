// App.js — Application shell, view switching, theme control

const App = {
  currentView: 'player',

  init() {
    // Theme
    this.initTheme();

    // Date display
    this.updateDate();
    setInterval(() => this.updateDate(), 60000);

    // View navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this.switchView(item.dataset.view);
      });
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Settings theme toggle
    document.getElementById('toggle-theme').addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-theme', e.target.checked ? 'light' : 'dark');
      localStorage.setItem('theme', e.target.checked ? 'light' : 'dark');
    });

    // Particle count setting
    document.getElementById('setting-particles').addEventListener('input', (e) => {
      ParticleBg.setCount(parseInt(e.target.value));
    });

    // Load profile data
    this.loadProfile();

    // Player init
    Player.init();

    // Chat init
    Chat.init();

    // Chat panel toggle (mobile)
    document.getElementById('chat-toggle').addEventListener('click', () => {
      document.getElementById('chat-panel').classList.add('open');
      document.getElementById('chat-overlay').classList.add('show');
    });
    document.getElementById('chat-close').addEventListener('click', () => {
      document.getElementById('chat-panel').classList.remove('open');
      document.getElementById('chat-overlay').classList.remove('show');
    });
    document.getElementById('chat-overlay').addEventListener('click', () => {
      document.getElementById('chat-panel').classList.remove('open');
      document.getElementById('chat-overlay').classList.remove('show');
    });

    // Voice list
    this.initVoices();
    document.getElementById('setting-voice').addEventListener('change', (e) => {
      Chat.setVoice(e.target.value);
    });
    document.getElementById('voice-preview').addEventListener('click', () => {
      this.previewVoice();
    });

    // Particle bg init
    ParticleBg.init();
  },

  initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('toggle-theme').checked = saved === 'light';
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.getElementById('toggle-theme').checked = next === 'light';
    localStorage.setItem('theme', next);
  },

  initVoices() {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const sel = document.getElementById('setting-voice');
      if (!sel) return;
      // Keep the default option
      sel.innerHTML = '<option value="">系统默认</option>';
      const zhVoices = voices.filter(v => v.lang.startsWith('zh'));
      zhVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name + (v.localService ? ' (本地)' : '');
        sel.appendChild(opt);
      });
      // Add non-Chinese voices too
      if (zhVoices.length === 0) {
        voices.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name + ' (' + v.lang + ')';
          sel.appendChild(opt);
        });
      }
      // Restore saved preference
      const saved = localStorage.getItem('tts_voice') || '';
      if (saved) sel.value = saved;
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  },

  previewVoice() {
    const sel = document.getElementById('setting-voice');
    const voiceName = sel.value;
    const testText = '你好，我是Claudio，你的私人音乐DJ。今天想听点什么？';

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(testText);
    u.lang = 'zh-CN';
    u.rate = 1.1;
    u.pitch = 1.0;
    u.volume = 0.8;

    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.name === voiceName);
      if (match) u.voice = match;
    }

    window.speechSynthesis.speak(u);
  },

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${viewName}`);
    });
    if (viewName === 'profile') this.loadProfile();
  },

  updateDate() {
    const now = new Date();
    const str = now.toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    });
    document.getElementById('date-display').textContent = str;
  },

  async loadProfile() {
    try {
      const res = await fetch('/api/taste');
      const data = await res.json();
      document.getElementById('taste-content').textContent = data.taste || '尚未配置品味档案';
    } catch (_) { Toast.error('加载品味档案失败'); }

    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      document.getElementById('stat-total').textContent = data.total || 0;
      document.getElementById('stat-today').textContent = data.today || 0;

      // Show recent likes
      if (data.likes && data.likes.length > 0) {
        const names = data.likes.slice(0, 3).map(l => l.title + ' - ' + l.artist).join('\n');
        const el = document.getElementById('taste-content');
        el.textContent = (el.textContent || '') + '\n\n你最近喜欢的：\n' + names;
      }
    } catch (_) { Toast.error('加载播放统计失败'); }
  },

};

document.addEventListener('DOMContentLoaded', () => App.init());
