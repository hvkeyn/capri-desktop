'use strict';

// The folder of a work order, as her tools see it: files read, written, patched, listed, searched.
//
// Every call resolves its path through guard.js first, so nothing here can reach outside the folder
// you gave her. The caps are there because a model asking for "the whole repo" would put a megabyte
// into a context window that has to hold a conversation too: it gets a slice, and asks for the next.

const fs = require('node:fs');
const path = require('node:path');
const guard = require('./guard');

const READ_MAX = 160 * 1024;   // one read, in bytes
const WRITE_MAX = 512 * 1024;  // one write, in bytes
const LIST_MAX = 200;          // entries in one listing
const HITS_MAX = 100;          // matches in one search
const SEARCH_WALK_MAX = 4000;  // files walked before the search gives up
const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'target', 'vendor', '.venv', 'venv', '__pycache__']);
const BINARY = /\.(png|jpe?g|gif|webp|bmp|ico|woff2?|ttf|otf|mp[34]|wav|ogg|zip|7z|rar|gz|tgz|exe|dll|so|dylib|pdf|asar|db|sqlite|bin|dat|psd|blend|fbx|glb|gltf)$/i;

function fail(reason) {
  return { ok: false, error: reason };
}

function read(root, rel, { offset = 0, limit = READ_MAX } = {}) {
  const at = guard.resolve(root, rel);
  if (!at.ok) return fail(at.reason);
  let stat;
  try {
    stat = fs.statSync(at.path);
  } catch {
    return fail(`no such file: ${rel}`);
  }
  if (!stat.isFile()) return fail(`not a file: ${rel}`);
  if (BINARY.test(at.path)) return fail(`${rel} is a binary file; only text can be read`);
  if (stat.size > 4 * 1024 * 1024) return fail(`${rel} is ${Math.round(stat.size / 1024)} KB, too big to read at once`);
  const bytes = Math.min(limit, READ_MAX);
  const fd = fs.openSync(at.path, 'r');
  try {
    const buf = Buffer.alloc(Math.min(bytes, Math.max(0, stat.size - offset)));
    const readBytes = fs.readSync(fd, buf, 0, buf.length, offset);
    const text = buf.subarray(0, readBytes).toString('utf8');
    const clipped = offset + readBytes < stat.size;
    return {
      ok: true,
      path: rel,
      bytes: stat.size,
      offset,
      text,
      ...(clipped ? { more: true, nextOffset: offset + readBytes } : {}),
    };
  } finally {
    fs.closeSync(fd);
  }
}

function write(root, rel, content) {
  const at = guard.resolve(root, rel);
  if (!at.ok) return fail(at.reason);
  const body = Buffer.from(String(content ?? ''), 'utf8');
  if (body.length > WRITE_MAX) return fail(`that is ${Math.round(body.length / 1024)} KB; one write is ${WRITE_MAX / 1024} KB at most`);
  try {
    fs.mkdirSync(path.dirname(at.path), { recursive: true });
    fs.writeFileSync(at.path, body);
    return { ok: true, path: rel, bytes: body.length };
  } catch (err) {
    return fail(err.message);
  }
}

// A patch that has to bite exactly once: a replace that finds nothing, or finds the same text twice,
// is refused, so an edit never lands on the wrong place of a file she only skimmed.
function patch(root, rel, find, replace) {
  const at = guard.resolve(root, rel);
  if (!at.ok) return fail(at.reason);
  let text;
  try {
    text = fs.readFileSync(at.path, 'utf8');
  } catch {
    return fail(`no such file: ${rel}`);
  }
  const needle = String(find ?? '');
  if (!needle) return fail('nothing to find');
  const first = text.indexOf(needle);
  if (first < 0) return fail(`that text is not in ${rel}; read it (or write the whole file) instead`);
  if (text.indexOf(needle, first + needle.length) >= 0) return fail(`that text is in ${rel} more than once; give more of it`);
  const next = text.slice(0, first) + String(replace ?? '') + text.slice(first + needle.length);
  const res = write(root, rel, next);
  return res.ok ? { ok: true, path: rel, bytes: Buffer.byteLength(next) } : res;
}

function list(root, rel = '.') {
  const at = guard.resolve(root, rel);
  if (!at.ok) return fail(at.reason);
  let entries;
  try {
    entries = fs.readdirSync(at.path, { withFileTypes: true });
  } catch {
    return fail(`no such folder: ${rel}`);
  }
  const rows = entries
    .filter((e) => !SKIP.has(e.name))
    .slice(0, LIST_MAX)
    .map((e) => {
      const full = path.join(at.path, e.name);
      let size = null;
      try { size = e.isFile() ? fs.statSync(full).size : null; } catch { /* gone already */ }
      return { name: e.name, dir: e.isDirectory(), bytes: size };
    });
  return { ok: true, path: rel, entries: rows, ...(entries.length > rows.length ? { more: true } : {}) };
}

// Files under `rel` whose text matches `pattern` (a plain substring or a /regex/), one line each.
function search(root, pattern, { rel = '.', limit = HITS_MAX } = {}) {
  const at = guard.resolve(root, rel);
  if (!at.ok) return fail(at.reason);
  const source = String(pattern || '');
  if (!source) return fail('nothing to search for');
  let test;
  try {
    test = /^\/.*\/[gimsuy]*$/.test(source) ? new RegExp(source.slice(1, source.lastIndexOf('/')), source.slice(source.lastIndexOf('/') + 1)) : null;
  } catch {
    return fail('that is not a valid pattern');
  }
  const hits = [];
  let walked = 0;
  const walk = (dir) => {
    if (hits.length >= limit || walked > SEARCH_WALK_MAX) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= limit) return;
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (BINARY.test(e.name)) continue;
      walked += 1;
      let text;
      try {
        if (fs.statSync(full).size > READ_MAX) continue;
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hit = test ? test.test(line) : line.toLowerCase().includes(source.toLowerCase());
        if (test) test.lastIndex = 0;
        if (!hit) continue;
        hits.push({ file: path.relative(root, full).split(path.sep).join('/'), line: i + 1, text: line.trim().slice(0, 240) });
        if (hits.length >= limit) break;
      }
    }
  };
  walk(at.path);
  return { ok: true, pattern: source, hits, ...(hits.length >= limit ? { more: true } : {}) };
}

module.exports = { read, write, patch, list, search, READ_MAX, WRITE_MAX };
