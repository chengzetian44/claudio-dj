// Toast notification — lightweight, non-blocking
const Toast = {
  _timer: null,

  show(msg, type, duration) {
    type = type || '';
    duration = duration || 2800;
    var container = document.getElementById('toast-container');
    if (!container) return;

    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    container.appendChild(el);

    // Auto-remove after animation ends (2.5s + 0.35s)
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, duration);
  },

  error: function(msg) { this.show(msg, 'error', 3500); },
  success: function(msg) { this.show(msg, 'success', 2500); },
};
