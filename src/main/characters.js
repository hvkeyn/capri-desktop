'use strict';

// Who lives on your desktop: her (the built-in Capri), or a character you dropped in. A character is a
// folder holding a skin.json and its pictures: the figure (240x420, cut out of its background), her
// faces (256x256, for her panels) and the cut-in close-ups (360x240) are optional but make it feel
// alive. Folders are read from the app's assets/characters/ (what a build ships) and from
// <userData>/characters/ (yours, kept across updates). Switching only reloads the pictures.

const fs = require('node:fs');
const path = require('node:path');

const ID = /^[a-z0-9][a-z0-9._-]{0,31}$/i;
const IMAGE = /\.(png|webp|jpe?g)$/i;
const BUILTIN = { id: 'capri', label: 'Capri' };

// A file name from skin.json, made into a URL under `base`; null when it's not a plain image name.
function picture(base, name) {
  return typeof name === 'string' && IMAGE.test(name) && !/[\\/]/.test(name) ? base + name : null;
}

const map = (base, files) => Object.fromEntries(Object.entries(files || {})
  .map(([name, file]) => [name, picture(base, file)])
  .filter(([, url]) => url));

// { label, base, sprite, faces, cutins, scale } from a folder, or null when it isn't one
function read(dir, base) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8'));
  } catch {
    return null; // no skin.json, or not JSON: not a character
  }
  if (!raw || typeof raw !== 'object') return null;
  const sprite = raw.sprite || 'full.png';
  const url = picture(base, sprite);
  if (!url || !fs.existsSync(path.join(dir, sprite))) return null;
  const scale = Number(raw.scale);
  const grade = Number(raw.grade);
  return {
    label: String(raw.label || '').trim().slice(0, 40),
    base,
    sprite: url,
    faces: map(base, raw.faces),
    cutins: map(base, raw.cutins),
    scale: Number.isFinite(scale) && scale > 0 ? Math.min(2, Math.max(0.2, scale)) : null,
    // her shader's colour grade (pinks to hot red, mask to green) is hers: a skin keeps its own colours
    grade: Number.isFinite(grade) ? Math.min(1, Math.max(0, grade)) : null,
  };
}

function folders(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && ID.test(e.name))
      .map((e) => e.name);
  } catch {
    return []; // no folder: nothing there
  }
}

const rootFor = (source, dirs) => (source === 'user' ? dirs.userDir : dirs.assetsDir);
// Her own pictures sit in the app; yours are served under the app's own origin (main.js) so her
// shader may use them as a texture (a texture from another origin is refused).
const baseFor = (id, source) => (source === 'user' ? `capri://app/characters/${id}/` : `capri://app/assets/characters/${id}/`);

// [{ id, label, source }], the built-in first, then yours, then what the build ships
function list(dirs) {
  const out = [{ id: BUILTIN.id, label: BUILTIN.label, source: 'builtin' }];
  for (const source of ['user', 'bundled']) {
    const root = rootFor(source, dirs);
    for (const id of folders(root)) {
      if (out.some((c) => c.id === id)) continue;
      const skin = read(path.join(root, id), baseFor(id, source));
      if (skin) out.push({ id, label: skin.label || id, source });
    }
  }
  return out;
}

// The one picked, pictures and all; null for her own (her pictures are the defaults everywhere).
function get(id, dirs) {
  if (!id || id === BUILTIN.id) return null;
  const hit = list(dirs).find((c) => c.id === id && c.source !== 'builtin');
  if (!hit) return null;
  const skin = read(path.join(rootFor(hit.source, dirs), id), baseFor(id, hit.source));
  return skin && { id, source: hit.source, label: skin.label || id, ...skin };
}

module.exports = { list, get, BUILTIN };
