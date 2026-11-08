// The guitar: he sits where the character stands, at the character's own size, and plays a whole song.
//
// The drawing is a canvas, not an <img> that is re-pointed every 70 ms: all 24 frames are decoded once, and
// the loop paints the current one into the same surface. Nothing re-layouts, nothing flickers, and the
// head sway reads as one long wave instead of a slideshow.

const FRAME_MS = 70;
const GLITCH_MS = 320;

export class Guitar {
  constructor({ capri, panel, host, skin }) {
    this.capri = capri;
    this.panel = panel;
    this.host = host;
    this.frames = Array.isArray(skin?.guitar?.frames) ? skin.guitar.frames : [];
    this.tracks = Array.isArray(skin?.guitar?.tracks) ? skin.guitar.tracks : [];
    this.audio = null;
    this.canvas = null;
    this.ctx = null;
    this.images = [];
    this.timer = 0;
    this.raf = 0;
    this.frame = 0;
    this.last = -1;
    this.started = 0;
    this.onChange = null;
  }

  get available() {
    return Boolean(this.frames.length && this.tracks.length);
  }

  get playing() {
    return Boolean(this.canvas);
  }

  loadFrames() {
    if (this.images.length) return Promise.resolve(this.images);
    return Promise.all(this.frames.map((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }))).then((list) => {
      this.images = list.filter(Boolean);
      return this.images;
    });
  }

  // Exactly the avatar's size, centred on the avatar's place: the same person, sitting down.
  place(target = this.canvas) {
    if (!target) return;
    const avatar = document.getElementById('capri');
    const rect = avatar?.getBoundingClientRect();
    const height = Math.round(rect?.height || window.innerHeight * 0.36);
    const ratio = (this.images[0]?.naturalWidth || 972) / (this.images[0]?.naturalHeight || 1417);
    const width = Math.round(height * ratio);
    const bottom = Math.max(0, Math.round(window.innerHeight - (rect?.bottom ?? window.innerHeight)));
    const left = Math.round((rect?.left ?? window.innerWidth - width - 10) + ((rect?.width ?? width) - width) / 2);
    target.style.height = `${height}px`;
    target.style.width = `${width}px`;
    target.style.bottom = `${bottom}px`;
    target.style.left = `${Math.max(0, left)}px`;
    target.style.right = 'auto';
  }

  async start({ seconds = 0, volume = 0.55, track = null } = {}) {
    if (!this.available || this.playing) return false;
    const index = track ?? this.nextTrack();
    const src = this.tracks[index];
    if (!src) return false;

    const images = await this.loadFrames();
    if (!images.length) return false;

    const canvas = document.createElement('canvas');
    canvas.className = 'guitar';
    canvas.width = images[0].naturalWidth;
    canvas.height = images[0].naturalHeight;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.place(canvas);
    this.paint(0);

    const avatarEl = document.getElementById('capri');
    if (avatarEl) {
      avatarEl.dataset.wasVisible = avatarEl.style.visibility || '';
      avatarEl.style.visibility = 'hidden';
    }
    document.body.appendChild(canvas);
    canvas.style.opacity = '1';
    canvas.classList.add('is-here');

    this.frame = 0;
    this.started = performance.now();
    const tick = () => {
      if (!this.canvas) return;
      const want = Math.floor((performance.now() - this.started) / FRAME_MS) % images.length;
      if (want !== this.frame) {
        this.frame = want;
        this.paint(want);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    const audio = new Audio(src);
    audio.volume = volume;
    audio.preload = 'auto';
    this.audio = audio;
    audio.addEventListener('ended', () => this.finish());
    audio.play().catch(() => {});

    if (seconds > 0) this.timer = setTimeout(() => this.interrupt(), seconds * 1000);
    this.onChange?.(true);
    return true;
  }

  paint(index) {
    const img = this.images[index];
    if (!img || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
  }

  finish() {
    this.teardown(false);
  }

  interrupt() {
    if (!this.playing) return;
    this.teardown(true);
  }

  teardown(glitch) {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = 0;
    this.raf = 0;
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {
        // already gone
      }
      this.audio = null;
    }
    if (!this.canvas) return;
    const el = this.canvas;
    this.canvas = null;
    this.ctx = null;
    const avatarEl = document.getElementById('capri');
    if (glitch) el.classList.add('is-glitching');
    else el.classList.remove('is-here');
    setTimeout(() => {
      el.remove();
      if (avatarEl) {
        avatarEl.style.visibility = avatarEl.dataset.wasVisible || '';
        avatarEl.classList.add('is-reappearing');
        setTimeout(() => avatarEl.classList.remove('is-reappearing'), 320);
      }
    }, glitch ? GLITCH_MS + 40 : 260);
    this.onChange?.(false);
  }

  toggle() {
    if (this.playing) this.interrupt();
    else this.start();
  }

  nextTrack() {
    if (this.tracks.length < 2) return 0;
    let index = Math.floor(Math.random() * this.tracks.length);
    if (index === this.last) index = (index + 1) % this.tracks.length;
    this.last = index;
    return index;
  }

  maybe() {
    if (!this.available || this.playing) return;
    if (Math.random() > 0.3) return;
    this.start({ seconds: 7, volume: 0.4 });
  }
}
