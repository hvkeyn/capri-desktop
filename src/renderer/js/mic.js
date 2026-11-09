// Her ears: the microphone. Press Ctrl+Alt+M (or her menu › Her voice › Talk into the microphone), say
// the thing, press it again — the words go into her chat's field. The listening and the words are all on
// this PC (whisper.cpp, in the main process); nothing is sent anywhere until you send the message.

const RATE = 16000; // whisper wants 16 kHz mono: the audio context does the resampling for us

// Float samples in [-1, 1] to a 16-bit mono wav, which is what whisper.cpp reads.
export function encodeWav(chunks, rate = RATE) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + total * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // a pcm chunk
  view.setUint16(20, 1, true); // pcm
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // a frame
  view.setUint16(34, 16, true); // bits a sample
  text(36, 'data');
  view.setUint32(40, total * 2, true);
  let at = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return buffer;
}

export class Mic {
  constructor({ host, onText, onState }) {
    this.host = host;
    this.onText = onText;   // (text) => void
    this.onState = onState; // ('listening' | 'thinking' | 'off', extra) => void
    this.rec = null;
    this.stream = null;
    this.startedAt = 0;
  }

  get listening() {
    return Boolean(this.rec);
  }

  async toggle() {
    if (this.rec) return this.stop();
    return this.start();
  }

  async start() {
    if (this.rec) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      this.onState?.('off', `микрофона нет: ${err.message}`);
      return;
    }
    const ctx = new AudioContext({ sampleRate: RATE });
    const source = ctx.createMediaStreamSource(this.stream);
    const sink = ctx.createGain();
    sink.gain.value = 0; // no echo: the samples go to the processor, not to the speakers
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);
    this.rec = { ctx, proc, source, sink, chunks };
    this.startedAt = performance.now();
    this.onState?.('listening');
  }

  async stop() {
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    const ms = performance.now() - this.startedAt;
    try {
      rec.proc.disconnect();
      rec.source.disconnect();
      rec.sink.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      await rec.ctx.close();
    } catch {
      // already closed
    }
    this.stream = null;
    if (ms < 400) {
      this.onState?.('off', 'слишком коротко');
      return;
    }
    const wav = encodeWav(rec.chunks);
    this.onState?.('thinking');
    const res = await this.host.transcribe(new Uint8Array(wav), document.documentElement.lang || 'ru').catch((err) => ({ error: err.message }));
    this.onState?.('off');
    if (res?.text) this.onText?.(res.text);
    else this.onState?.('off', res?.error || 'не расслышала');
  }
}
