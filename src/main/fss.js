'use strict';

// Search and file work, in the spirit of Kensaku (github.com/yjid/kensaku, MIT): find a file by the shape
// of its name in milliseconds, filter by what you remember (a type, a folder, "last week"), and then do
// something with it — look, copy, move, put in the bin.
//
// Kensaku's own trick is an index of names on disk plus full-text and OCR on top; here the index lives in
// memory for ten minutes and holds names, sizes and dates only — no content, nothing written to disk from
// what is in your folders. The full text is read on demand, file by file.
//
// Pure Node: no Electron, no native module. tools.js decides where and how far, and hands resolved paths.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Folders that are never worth walking: they hold thousands of files nobody searches by name.
const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor', '.venv', 'venv', '__pycache__',
  'AppData', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', '$Recycle.Bin',
  'System Volume Information', '.cache', '.npm', '.gradle', '.m2', 'Applications', 'Library',
]);

const STOP = new Set(['в','во','на','за','с','и','in','on','at','the','a','of','my','мои','моём','моем','для','по','мне','please','плиз']);
const EXT_WORDS = new Set(['png','jpg','jpeg','gif','webp','bmp','pdf','md','txt','json','js','ts','css','html','zip','psd','mp4','mp3','exe','log','csv','xml','yaml','yml']);
const MAX_ENTRIES = 120000;
const MAX_DEPTH = 8;
const INDEX_TTL = 10 * 60 * 1000;

// ---- the index ------------------------------------------------------------------------------------

const cache = new Map(); // root -> { at, entries }

function walk(root, { maxEntries = MAX_ENTRIES, maxDepth = MAX_DEPTH, now = Date.now() } = {}) {
  const entries = [];
  const visit = (dir, depth) => {
    if (entries.length >= maxEntries || depth > maxDepth) return;
    let list;
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of list) {
      if (entries.length >= maxEntries) return;
      if (SKIP.has(item.name) || item.name.startsWith('.')) continue;
      const full = path.join(dir, item.name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      entries.push({ p: full, n: item.name, d: item.isDirectory(), s: stat.size, m: stat.mtimeMs });
      if (item.isDirectory()) visit(full, depth + 1);
    }
  };
  visit(root, 0);
  return entries;
}

// The index for a folder, kept for ten minutes: a search that walks the disk every time is not a search.
function index(root, { force = false, now = Date.now(), options } = {}) {
  const at = path.resolve(root || os.homedir());
  const hit = cache.get(at);
  if (!force && hit && now - hit.at < INDEX_TTL) return { entries: hit.entries, at: hit.at, cached: true };
  const entries = walk(at, { now, ...(options || {}) });
  cache.set(at, { at: now, entries });
  return { entries, at: now, cached: false };
}

// ---- the query ------------------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

const toBytes = (value, unit) => Number(value) * (unit.toLowerCase() === 'gb' ? 1024 ** 3 : unit.toLowerCase() === 'mb' ? 1024 ** 2 : 1024);

// What was typed, split into the words to match and the filters around them: ext:pdf, in:projects,
// modified:>7d, size:<10mb, and the phrases people actually use ("last week", "вчера", "сегодня").
function parseQuery(text, now = Date.now()) {
  const source = String(text || '').trim();
  const out = { terms: [], ext: null, inPath: null, project: false, modifiedAfter: null, modifiedBefore: null, sizeMin: null, sizeMax: null };
  const lower = source.toLowerCase();
  if (/\b(last|past)[ -]?week\b|за\s+(последнюю\s+)?неделю/.test(lower)) out.modifiedAfter = now - 7 * DAY;
  else if (/\b(last|past)[ -]?month\b|за\s+(последний\s+)?месяц/.test(lower)) out.modifiedAfter = now - 30 * DAY;
  else if (/\byesterday\b|вчера/.test(lower)) { out.modifiedAfter = now - 2 * DAY; out.modifiedBefore = now - DAY; }
  else if (/\btoday\b|сегодня/.test(lower)) out.modifiedAfter = now - DAY;
  for (const word of source.split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = /^ext:([a-z0-9,]+)$/i.exec(word))) { out.ext = m[1].toLowerCase().split(','); continue; }
    if ((m = /^in:(.+)$/i.exec(word))) { out.inPath = m[1].toLowerCase(); continue; }
    if ((m = /^modified:(>|<)(\d+)([dhwm])$/i.exec(word))) {
      const ms = Number(m[2]) * (m[3].toLowerCase() === 'w' ? 7 * DAY : m[3].toLowerCase() === 'm' ? 30 * DAY : m[3].toLowerCase() === 'h' ? 3600000 : DAY);
      if (m[1] === '>') out.modifiedAfter = now - ms; else out.modifiedBefore = now - ms;
      continue;
    }
    if ((m = /^size:(>|<)(\d+(?:\.\d+)?)(kb|mb|gb)$/i.exec(word))) {
      const bytes = toBytes(m[2], m[3]);
      if (m[1] === '>') out.sizeMin = bytes; else out.sizeMax = bytes;
      continue;
    }
    if (/^(в\s+)?проекте?$|^project$|^repo$|^repository$|^репозитори[йяи]$/i.test(word)) { out.project = true; continue; }
    if (EXT_WORDS.has(word.toLowerCase())) { out.ext = [word.toLowerCase()]; continue; }
    if (/^(last|past)$|^за$|^(последнюю|последний)$/i.test(word)) continue; // part of a phrase already read
    if (/^(week|month|day|неделю|месяц|день)$/i.test(word)) continue;
    if (!STOP.has(word.toLowerCase())) out.terms.push(word);
  }
  return out;
}

// How well a name answers one word: exact, then prefix, then anywhere, then the letters in order (which is
// how people remember a name they can't spell). Null when the letters do not fit at all.
function scoreName(name, term) {
  const n = name.toLowerCase();
  const t = String(term || '').toLowerCase();
  if (!t) return null;
  const at = n.indexOf(t);
  if (n === t) return { score: 120, exact: true, positions: [0] };
  if (at === 0) return { score: 100 - Math.min(20, n.length * 0.1), exact: true, positions: [0] };
  if (at > 0) return { score: 80 - Math.min(20, at * 0.6), exact: true, positions: [at] };
  if (t.length < 4) return null; // "png" must appear, not be spelled out across a long name
  let i = 0;
  let prev = -2;
  let score = 30;
  const positions = [];
  for (let j = 0; j < n.length && i < t.length; j++) {
    if (n[j] !== t[i]) continue;
    positions.push(j);
    score += 2 + (prev === j - 1 ? 6 : 0) + (j === 0 || /[._\-\s/]/.test(n[j - 1]) ? 4 : 0);
    prev = j;
    i += 1;
  }
  if (i < t.length) return null;
  return { score: score - Math.min(12, n.length * 0.05), exact: false, positions };
}

// The best `limit` names for a query, with the part of the path the words matched.
function search(entries, query, { limit = 20, now = Date.now(), project = null } = {}) {
  const q = typeof query === 'string' ? parseQuery(query, now) : query;
  const ext = q.ext ? new Set(q.ext.map((e) => `.${e.replace(/^\./, '')}`)) : null;
  const results = [];
  for (const entry of entries) {
    if (entry.d) continue; // a name search finds files; folders come back through tree()
    const lowerPath = entry.p.toLowerCase();
    if (q.project && project && !lowerPath.startsWith(String(project).toLowerCase())) continue;
    if (q.modifiedAfter && entry.m < q.modifiedAfter) continue;
    if (q.modifiedBefore && entry.m > q.modifiedBefore) continue;
    if (q.sizeMin && entry.s < q.sizeMin) continue;
    if (q.sizeMax && entry.s > q.sizeMax) continue;
    if (ext && !ext.has(path.extname(entry.n).toLowerCase())) continue;
    if (q.inPath && !lowerPath.includes(q.inPath)) continue;
    let total = 0;
    let matched = true;
    const positions = [];
    for (const term of q.terms) {
      const hit = scoreName(entry.n, term) || scoreName(entry.p, term);
      if (!hit) { matched = false; break; }
      if (!hit.exact && hit.score < 50) { matched = false; break; } // letters in order, but too scattered
      total += hit.score;
      positions.push(...hit.positions.slice(0, 32));
    }
    if (!matched) continue;
    if (!q.terms.length) total = 1; // only filters: everything that passed is a hit
    results.push({ path: entry.p, name: entry.n, size: entry.s, modified: entry.m, dir: entry.d, score: Math.round(total), positions });
  }
  results.sort((a, b) => b.score - a.score || b.modified - a.modified);
  return results.slice(0, limit);
}

// ---- the file work --------------------------------------------------------------------------------

function stat(p) {
  const target = path.resolve(String(p || ''));
  let s;
  try {
    s = fs.statSync(target);
  } catch (err) {
    return { error: err.code === 'ENOENT' ? 'no such file or folder' : err.message };
  }
  return {
    path: target,
    name: path.basename(target),
    dir: s.isDirectory(),
    bytes: s.size,
    created: s.birthtimeMs || null,
    modified: s.mtimeMs,
    extension: s.isDirectory() ? null : path.extname(target).toLowerCase(),
  };
}

// A folder as a tree, depth-limited, names only.
function tree(root, { depth = 2, limit = 200 } = {}) {
  const base = path.resolve(String(root || ''));
  const lines = [];
  const visit = (dir, level, prefix) => {
    if (level > depth || lines.length >= limit) return;
    let list;
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const shown = list.filter((e) => !SKIP.has(e.name)).slice(0, 40);
    shown.forEach((item, i) => {
      if (lines.length >= limit) return;
      const last = i === shown.length - 1;
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${item.name}${item.isDirectory() ? '/' : ''}`);
      if (item.isDirectory()) visit(path.join(dir, item.name), level + 1, `${prefix}${last ? '   ' : '│  '}`);
    });
  };
  visit(base, 1, '');
  return { root: base, lines, ...(lines.length >= limit ? { more: true } : {}) };
}

// Copy or move one file. A folder is refused: a recursive copy is a work order, not a keystroke.
function copy(from, to) {
  const a = path.resolve(String(from || ''));
  const b = path.resolve(String(to || ''));
  try {
    const s = fs.statSync(a);
    if (s.isDirectory()) return { error: 'only a file can be copied this way' };
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(a, b);
    return { ok: true, from: a, to: b, bytes: s.size };
  } catch (err) {
    return { error: err.message };
  }
}

function move(from, to) {
  const a = path.resolve(String(from || ''));
  const b = path.resolve(String(to || ''));
  try {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.renameSync(a, b);
    return { ok: true, from: a, to: b };
  } catch (err) {
    return { error: err.message };
  }
}

// Delete means "put it in the bin": a folder of her own, not gone-gone, so it can be brought back.
function trashDir() {
  return path.join(os.homedir(), '.capri-trash');
}

function toTrash(file) {
  const source = path.resolve(String(file || ''));
  let s;
  try {
    s = fs.statSync(source);
  } catch (err) {
    return { error: err.code === 'ENOENT' ? 'no such file' : err.message };
  }
  const bin = trashDir();
  try {
    fs.mkdirSync(bin, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(bin, `${stamp}-${path.basename(source)}`);
    fs.renameSync(source, target);
    return { ok: true, from: source, inBin: target, bytes: s.size };
  } catch (err) {
    return { error: err.message };
  }
}

function resetIndex() {
  cache.clear();
}

module.exports = {
  SKIP, walk, index, parseQuery, scoreName, search, stat, tree, copy, move, toTrash, trashDir, resetIndex,
};
