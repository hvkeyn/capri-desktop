// The guitar: he sits on the edge or in the corner, leans back and plays. A whole song from his playlist,
// or one chord when nothing is happening. He is drawn at the size of the character he sits beside — never
// bigger — and when you cut him off he comes apart in a glitch instead of vanishing.

const STRUM_MS = 70; // twenty-four drawings: a whole strumming cycle in 1.7 seconds
// a sitting man is shorter than the same man standing: this keeps him from looking like a giant
const SIT_SCALE = 0.78;
const GLITCH_MS = 320;

export class Guitar {
  constructor({ capri, panel, host, skin }) {
    this.capri = capri;
    this.panel = panel;
    this.host = host;
    this.frames = Array.isArray(skin?.guitar?.frames) ? skin.guitar.frames : [];
    this.tracks = Array.isArray(skin?.guitar?.tracks) ? skin.guitar.tracks : [];
    this.audio = null;
    this.el = null;
    this.timer = 0;
    this.frameTimer = 0;
    this.frame = 0;
    this.last = -1;
    this.onChange = null;
  }

  get available() {
    return Boolean(this.frames.length && this.tracks.length);
  }

  get playing() {
    return Boolean(this.el);
  }

  // The place: on the window edge under him when there is one, otherwise the corner of the screen, and
  // no taller than the character himself.
  place(img) {
    const avatar = document.getElementById('capri');
    const rect = avatar?.getBoundingClientRect();
    const floor = this.capri?.view?.floor || window.innerHeight;
    const height = Math.round((rect?.height || Math.floor(window.innerHeight * 0.36)) * SIT_SCALE);
    const width = Math.round((height * img.naturalWidth) / (img.naturalHeight || 1));
    const bottom = Math.max(0, Math.round(window.innerHeight - (rect?.bottom ?? floor)));
    const left = Math.round((rect?.left ?? window.innerWidth - width - 10) + ((rect?.width ?? width) - width) / 2);
    img.style.height = `${height}px`;
    img.style.width = `${width}px`;
    img.style.bottom = `${bottom}px`;
    img.style.left = `${Math.max(0, left)}px`;
    img.style.right = 'auto';
  }

  async start({ seconds = 0, volume = 0.55, track = null } = {}) {
    if (!this.available || this.playing) return false;
    const index = track ?? this.nextTrack();
    const src = this.tracks[index];
    if (!src) return false;

    // decode both drawings before showing anything: swapping them later must not flicker
    await Promise.all(this.frames.map((frame) => new Promise((resolve) => {
      const probe = new Image();
      probe.onload = probe.onerror = resolve;
      probe.src = frame;
    })));

    const img = document.createElement('img');
    img.className = 'guitar';
    img.src = this.frames[0];
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('load', () => this.place(img), { once: true });
    document.body.appendChild(img);
    this.el = img;
    this.place(img);
    img.style.opacity = '1';
    img.style.transform = 'none';
    img.classList.add('is-arriving');
    const avatarEl = document.getElementById('capri');
    if (avatarEl) {
      avatarEl.dataset.wasVisible = avatarEl.style.visibility || '';
      avatarEl.style.visibility = 'hidden';
    }
    requestAnimationFrame(() => {
      img.classList.remove('is-arriving');
      img.classList.add('is-here');
    });
    this.frame = 0;
    this.frameTimer = setInterval(() => {
      if (!this.el || this.frames.length < 2) return;
      this.frame = (this.frame + 1) % this.frames.length;
      this.el.src = this.frames[this.frame];
    }, STRUM_MS);

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

  // A song ran out: he puts the guitar down, no glitch, it was meant to end.
  finish() {
    this.teardown(false);
  }

  // Cut off in the middle: a short glitch, then gone.
  interrupt() {
    if (!this.playing) return;
    this.teardown(true);
  }

  teardown(glitch) {
    clearTimeout(this.timer);
    clearInterval(this.frameTimer);
    this.timer = 0;
    this.frameTimer = 0;
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {
        // already gone
      }
      this.audio = null;
    }
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    const avatarEl = document.getElementById('capri');
    // he comes back as the character appears again, out of the same glitch
    if (glitch) {
      el.classList.add('is-glitching');
    } else {
      el.classList.remove('is-here');
    }
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
