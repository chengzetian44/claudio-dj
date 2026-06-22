// Particles.js — Dynamic canvas particle background
// Hand-drawn using Canvas 2D API, no external dependencies

const ParticleBg = {
  canvas: null,
  ctx: null,
  particles: [],
  count: 60,
  animId: null,

  init() {
    this.canvas = document.getElementById('particles-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    this.spawn();
    this.animate();

    window.addEventListener('resize', () => this.resize());

    // Pause animation when tab is hidden to save CPU
    var self = this;
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        if (self.animId) { cancelAnimationFrame(self.animId); self.animId = null; }
      } else {
        if (!self.animId) self.animate();
      }
    });
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  spawn() {
    this.particles = [];
    for (let i = 0; i < this.count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 2.5 + 1,
      });
    }
  },

  setCount(n) {
    this.count = n;
    this.spawn();
  },

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());

    const { ctx, canvas, particles } = this;
    const style = getComputedStyle(document.documentElement);
    const particleColor = style.getPropertyValue('--particle-color').trim();
    const lineColor = style.getPropertyValue('--particle-line').trim();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update & draw
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = particleColor;
      ctx.fill();
    }

    // Draw connecting lines between nearby particles
    const maxDist = 120;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 1 - dist / maxDist;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  },
};
