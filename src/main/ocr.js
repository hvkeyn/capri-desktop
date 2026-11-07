'use strict';

// Reading a picture without a vision model: Windows' own OCR, through WinRT and a small PowerShell script.
// It is what makes "what is on my screen" answerable on a text-only provider — the layout is lost, the
// words are not. Russian and English engines are both available on this machine, so both are tried and the
// one that recognized its own script better wins.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

// Inside a packaged app this module lives in app.asar, and PowerShell cannot open a path inside an
// archive: the script is unpacked next to it (asarUnpack), and the path has to say so.
const scriptPath = (dirname) => {
  const bundled = path.join(dirname, 'ocr.ps1');
  return /app\.asar([\\/])/.test(bundled) ? bundled.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') : bundled;
};
const SCRIPT = scriptPath(__dirname);
const LANGS = ['ru', 'en-US'];
const TIMEOUT = 30000;

const run = (lang, file) => new Promise((resolve) => {
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Path', file, '-Lang', lang],
    { windowsHide: true, timeout: TIMEOUT }, (err, stdout) => {
      const text = String(stdout || '').trim();
      resolve(err || !text || /^OCR-FAILED|^NO-ENGINE/.test(text) ? '' : text);
    });
});

// How much of the text is in the script the engine was told to expect. A Russian engine reading English
// gives mostly Latin letters; an English engine reading Russian transliterates it into Latin letters, which
// looks perfect by this measure — so the choice below is made on the Russian result having real Cyrillic.
function quality(text, lang) {
  const letters = String(text || '').match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if (!letters.length) return 0;
  const cyrillic = (String(text).match(/[А-Яа-яЁё]/g) || []).length;
  const share = cyrillic / letters.length;
  return /^ru/i.test(lang) ? share : 1 - share;
}

// The best of the engines for this picture. `all` says what each one produced, for a report she can trust.
async function recognize(file, { langs = LANGS } = {}) {
  if (!fs.existsSync(file)) return { ok: false, error: 'no picture to read' };
  const results = [];
  for (const lang of langs) {
    const text = await run(lang, file);
    if (text) results.push({ lang, text, quality: Math.round(quality(text, lang) * 100) / 100 });
  }
  if (!results.length) return { ok: false, error: 'nothing was recognized on it' };
  // Russian wins when its own output is actually Cyrillic; otherwise the English engine is the one that can
  // read Latin script (and, on a Russian screen, transliterates rather than nothing at all).
  const ru = results.find((r) => r.lang === 'ru');
  const best = (ru && quality(ru.text, 'ru') >= 0.35 ? ru : results.find((r) => r.lang === 'en-US'))
    || results[0];
  return {
    ok: true,
    lang: best.lang,
    quality: best.quality,
    text: best.text.slice(0, 12000),
    ...(best.text.length > 12000 ? { more: true } : {}),
    all: results.map((r) => ({ lang: r.lang, quality: r.quality, characters: r.text.length })),
  };
}

module.exports = { recognize, quality, LANGS, SCRIPT, scriptPath };
