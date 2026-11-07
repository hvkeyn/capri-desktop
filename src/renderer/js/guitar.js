// The guitar: he sits on the edge of the screen, leans on it and plays. Sometimes it is one chord and
// gone; sometimes a whole track from his own playlist (the in-game songs, cut from the gamerip).
//
// It is a picture over the desktop, not a rig pose: the drawing is high-resolution and reads better at
// size than a 240-pixel sprite. Everything is cleaned up when the mode ends or the chat opens.

const SESSION_MAX = 26; // seconds of a full track before he puts it down by himself

export class Guitar {
  constructor({ capri, panel, host, skin }) {
    this.capri = capri;
    this.panel = panel;
    this.host = host;
    this.tracks = Array.isArray(skin?.guitar?.tracks) ? skin.guitar.tracks : [];
    this.image = skin?.guitar?.image || '';
    this.audio = null;
    this.el = null;
    this.timer = 0;
    this.last = -1;
    this.busy = false;
    this.onChange = null;
  }

  get available() {
    return Boolean(this.image && this.tracks.length);
  }

  get playing() {
    return Boolean(this.el);
  }

  // The picture on the edge, and the sound with it. `seconds` limits a chord; a full track plays out.
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

    const audio = new Audio(src);
    audio.volume = volume;
    audio.preload = 'auto';
    this.audio = audio;
    audio.addEventListener('ended', () => this.stop());
    audio.play().catch(() => {});

    this.timer = setTimeout(() => this.stop(), seconds > 0 ? seconds * 1000 : SESSION_MAX * 1000);
    this.onChange?.(true);
    return true;
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = 0;
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

  // Nothing is happening: now and then, one chord and no more — never twice in a row.
  maybe() {
    if (!this.available || this.playing || this.busy) return;
    if (Math.random() > 0.3) return;
    this.start({ seconds: 6, volume: 0.4 });
  }
}
