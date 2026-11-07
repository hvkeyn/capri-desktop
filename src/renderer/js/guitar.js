// The guitar: he sits on the edge of the screen, leans on it and plays. Sometimes it is one chord and
// gone; sometimes a whole song from his own playlist (the in-game tracks, cut from the gamerip).
//
// The frames are a real animation (56 of them, cut from his sheet): while a song plays, they run in a loop
// at a strumming pace. When a chord is asked for, the same loop runs for a few seconds and stops.

const FRAME_MS = 85; // a strumming pace, not a film: he is sitting, not running

export class Guitar {
  constructor({ capri, panel, host, skin }) {
    this.capri = capri;
    this.panel = panel;
    this.host = host;
    this.frames = Array.isArray(skin?.guitar?.frames) ? skin.guitar.frames : [];
    this.image = skin?.guitar?.image || this.frames[0] || '';
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
    return Boolean(this.image && this.tracks.length);
  }

  get playing() {
    return Boolean(this.el);
  }

  start({ seconds = 0, volume = 0.55, track = null } = {}) {
    if (!this.available || this.playing) return false;
    const index = track ?? this.nextTrack();
    const src = this.tracks[index];
    if (!src) return false;

    const img = document.createElement('img');
    img.className = 'guitar';
    img.src = this.image;
    img.alt = '';
    document.body.appendChild(img);
    this.el = img;
    requestAnimationFrame(() => img.classList.add('is-here'));
    this.runFrames();

    const audio = new Audio(src);
    audio.volume = volume;
    audio.preload = 'auto';
    this.audio = audio;
    audio.addEventListener('ended', () => this.stop());
    audio.play().catch(() => {});

    if (seconds > 0) this.timer = setTimeout(() => this.stop(), seconds * 1000);
    this.onChange?.(true);
    return true;
  }

  runFrames() {
    if (this.frames.length < 2 || !this.el) return;
    clearInterval(this.frameTimer);
    this.frame = 0;
    this.frameTimer = setInterval(() => {
      if (!this.el) return;
      this.frame = (this.frame + 1) % this.frames.length;
      this.el.src = this.frames[this.frame];
    }, FRAME_MS);
  }

  stop() {
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
    if (this.el) {
      this.el.classList.remove('is-here');
      const el = this.el;
      this.el = null;
      setTimeout(() => el.remove(), 260);
    }
    this.onChange?.(false);
  }

  toggle() {
    if (this.playing) this.stop();
    else this.start();
  }

  nextTrack() {
    if (this.tracks.length < 2) return 0;
    let index = Math.floor(Math.random() * this.tracks.length);
    if (index === this.last) index = (index + 1) % this.tracks.length;
    this.last = index;
    return index;
  }

  // Nothing is happening: now and then one chord and no more.
  maybe() {
    if (!this.available || this.playing) return;
    if (Math.random() > 0.3) return;
    this.start({ seconds: 7, volume: 0.4 });
  }
}
