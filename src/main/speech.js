'use strict';

// Her voice from a text-to-speech service: one running on your PC that speaks OpenAI's speech API
// (Kokoro-FastAPI, openedai-speech…), OpenAI's own, or ElevenLabs'. Windows' own voices need none
// of this: the overlay speaks those itself (speech.js there). Returns the audio (mp3) for the
// overlay to play; the keys never leave this process.
//
// `piper` is the one that speaks Russian on your own machine, with nothing to buy: a small binary and
// a voice pack downloaded once (engines/ensurePiper), and a wav back. `transcribe` is the other way
// round: her ears, whisper.cpp, also on your machine (engines/ensureWhisper).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const SERVICES = {
  local: { url: 'http://127.0.0.1:8880/v1', voice: 'af_bella', model: 'kokoro' },
  openai: { url: 'https://api.openai.com/v1', voice: 'shimmer', model: 'gpt-4o-mini-tts' },
  elevenlabs: { url: 'https://api.elevenlabs.io/v1', voice: '', model: 'eleven_flash_v2_5' },
  piper: { voice: 'ru_RU-irina-medium' }, // on this PC, nothing to install by hand
};

// What the local engines are, and where they come from. The voice packs are the ones rhasspy ships.
const PIPER = {
  url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
  voices: {
    'ru_RU-irina-medium': 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx',
    'ru_RU-dmitri-medium': 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx',
  },
};
const WHISPER = {
  url: 'https://github.com/ggerganov/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
  model: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
};

// Where the downloaded engines live (main.js points this at her storage).
let deps = { dir: () => path.join(os.homedir(), '.capri-speech') };
function attach(next = {}) {
  deps = { ...deps, ...next };
  return deps;
}
const root = () => deps.dir();
const piperExe = () => path.join(root(), 'piper', 'piper', 'piper.exe');
const piperVoice = (name) => path.join(root(), 'piper', 'voices', `${name}.onnx`);
const whisperExe = () => path.join(root(), 'whisper', 'Release', 'whisper-cli.exe');
const whisperModel = () => path.join(root(), 'whisper', 'ggml-base.bin');

const has = (file) => {
  try { return fs.statSync(file).size > 0; } catch { return false; }
};

// How she sounds, for the services that take a direction (OpenAI's gpt-4o-mini-tts)
const STYLE = 'A young woman, cool and a little teasing, with a dry sense of humor. Low-to-mid pitch, '
  + 'slightly husky, relaxed pace, clear words. Confident, never bubbly, never robotic.';

// Her lines come back often ("Mission terminée", her greetings): the last ones asked for are kept.
const CACHE_MAX = 40;
const cache = new Map();

const TIMEOUT_MS = 20000;

// A download with a progress callback: { got, total } in bytes.
async function download(url, file, onProgress = () => {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  const out = fs.createWriteStream(part);
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(1800000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    got += chunk.length;
    onProgress({ got, total });
  }
  await new Promise((resolve, reject) => { out.end(() => resolve()); out.on('error', reject); });
  fs.renameSync(part, file);
  return file;
}

const unzip = (zip, where) => new Promise((resolve, reject) => {
  fs.mkdirSync(where, { recursive: true });
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${where.replace(/'/g, "''")}' -Force`],
  { windowsHide: true, timeout: 600000 }, (err) => (err ? reject(err) : resolve(where)));
});

// The Russian voice on this PC: piper and the voice pack, once. Resolves { dir } or throws with words.
async function ensurePiper(onProgress = () => {}) {
  const voice = 'ru_RU-irina-medium';
  if (has(piperExe()) && has(piperVoice(voice))) return { exe: piperExe(), voice: piperVoice(voice) };
  const zip = path.join(root(), 'piper.zip');
  if (!has(piperExe())) {
    onProgress({ step: 'piper', got: 0, total: 0 });
    await download(PIPER.url, zip, (p) => onProgress({ step: 'piper', ...p }));
    await unzip(zip, path.join(root(), 'piper'));
    fs.rmSync(zip, { force: true });
  }
  if (!has(piperVoice(voice))) {
    for (const ext of ['', '.json']) {
      await download(`${PIPER.voices[voice]}${ext}`, `${piperVoice(voice)}${ext}`, (p) => onProgress({ step: 'voice', ...p }));
    }
  }
  return { exe: piperExe(), voice: piperVoice(voice) };
}

// Her ears: whisper.cpp and a model, once.
async function ensureWhisper(onProgress = () => {}) {
  if (has(whisperExe()) && has(whisperModel())) return { exe: whisperExe(), model: whisperModel() };
  if (!has(whisperExe())) {
    const zip = path.join(root(), 'whisper.zip');
    await download(WHISPER.url, zip, (p) => onProgress({ step: 'whisper', ...p }));
    await unzip(zip, path.join(root(), 'whisper'));
    fs.rmSync(zip, { force: true });
  }
  if (!has(whisperModel())) await download(WHISPER.model, whisperModel(), (p) => onProgress({ step: 'model', ...p }));
  return { exe: whisperExe(), model: whisperModel() };
}

// What is already on this PC, for her panel and the menu.
function engines() {
  return {
    piper: has(piperExe()) && has(piperVoice('ru_RU-irina-medium')),
    whisper: has(whisperExe()) && has(whisperModel()),
  };
}

// piper, in one turn: the text on stdin, a wav file out, read back as a Buffer.
function piperSay(text, { exe, voice }) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(piperVoice('x')), { recursive: true });
    const wav = path.join(path.dirname(voice), '..', `say-${process.pid}-${Date.now()}.wav`);
    const child = spawn(exe, ['-m', voice, '-f', wav, '--length_scale', '1.02'], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString().slice(0, 400); });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        if (code !== 0) return reject(new Error(err.trim().split('\n').pop() || `piper exit ${code}`));
        const audio = fs.readFileSync(wav);
        fs.rmSync(wav, { force: true });
        if (!audio.length) return reject(new Error('piper wrote nothing'));
        resolve(audio);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(`${text}\n`, 'utf8');
  });
}

// `text` spoken by `service` ({ provider, voice, url } from her config, `key` for it): the audio as
// a Buffer, or throws with what went wrong, in a few words.
async function synthesize(text, { provider, voice, url }, key = '') {
  const s = SERVICES[provider];
  if (!s) throw new Error('no voice service');
  const input = String(text).trim().slice(0, 600);
  if (!input) throw new Error('nothing to say');
  const name = voice || s.voice;
  const id = `${provider}|${url || ''}|${name}|${input}`;
  if (cache.has(id)) {
    const hit = cache.get(id);
    cache.delete(id); // most recent last
    cache.set(id, hit);
    return hit;
  }
  if (provider === 'piper') {
    const engine = await ensurePiper();
    // the voice the config names, when that pack is there; otherwise the one that was installed
    const picked = PIPER.voices[name] && has(piperVoice(name)) ? piperVoice(name) : engine.voice;
    const audio = await piperSay(input, { exe: engine.exe, voice: picked });
    cache.set(id, audio);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return audio;
  }
  if (provider !== 'local' && !key) throw new Error('no key');

  let res;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  if (provider === 'elevenlabs') {
    if (!name) throw new Error('no voice id');
    res = await fetch(`${s.url}/text-to-speech/${encodeURIComponent(name)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: input, model_id: s.model }),
      signal,
    });
  } else {
    const base = (provider === 'local' ? (url || s.url) : s.url).replace(/\/+$/, '');
    const body = { model: s.model, voice: name, input, response_format: 'mp3' };
    if (provider === 'openai') body.instructions = STYLE;
    res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) },
      body: JSON.stringify(body),
      signal,
    });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`${res.status}${detail ? ` ${detail}` : ''}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  cache.set(id, audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return audio;
}

// Her ears: a wav (16 kHz mono) in, the words out. whisper.cpp on this PC, nothing sent anywhere.
async function transcribe(wav, lang = 'ru') {
  const bytes = Buffer.isBuffer(wav) ? wav : Buffer.from(wav || []);
  if (bytes.length < 44) throw new Error('nothing to listen to');
  const engine = await ensureWhisper();
  const dir = path.join(os.tmpdir(), 'capri-ears');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `in-${process.pid}-${Date.now()}.wav`);
  fs.writeFileSync(file, bytes);
  try {
    const text = await new Promise((resolve, reject) => {
      execFile(engine.exe, ['-m', engine.model, '-f', file, '-l', String(lang || 'ru').slice(0, 5), '-nt', '-np'],
        { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
          if (err) return reject(new Error(err.message.split('\n')[0]));
          resolve(String(out || '').trim());
        });
    });
    return text.replace(/\s+/g, ' ').trim();
  } finally {
    fs.rmSync(file, { force: true });
  }
}

module.exports = { synthesize, transcribe, engines, ensurePiper, ensureWhisper, attach, SERVICES, PIPER, WHISPER };
