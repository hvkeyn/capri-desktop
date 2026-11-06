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

// A file name from skin.json, made into a URL under `base`; null when it isn't a plain image path
// (one folder deep is fine: "poses/smoke.png").
function picture(base, name) {
  if (typeof name !== 'string' || !IMAGE.test(name)) return null;
  if (name.includes('\\') || name.startsWith('/') || name.includes('..')) return null;
  return base + name;
}

const map = (base, files) => Object.fromEntries(Object.entries(files || {})
  .map(([name, file]) => [name, picture(base, file)])
  .filter(([, url]) => url));

// A JSON file inside a character's folder (its own lines, per language), or null
function jsonFile(dir, name) {
  if (typeof name !== 'string' || name.includes('..') || name.startsWith('/') || name.includes('\\')) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  } catch {
    return null;
  }
}

// The storyboard it walks in with: frames, where the close-ups start, how long each stays, and the
// captions in the corner of the screen
function introOf(base, raw) {
  if (!raw || !Array.isArray(raw.frames)) return null;
  const frames = raw.frames.map((file) => picture(base, file)).filter(Boolean);
  if (!frames.length) return null;
  const closeupFrom = Number(raw.closeupFrom);
  const frameMs = Number(raw.frameMs);
  const durations = Array.isArray(raw.durations)
    ? raw.durations.map((ms) => Math.min(4000, Math.max(80, Number(ms) || 0)))
    : [];
  const captions = Array.isArray(raw.captions)
    ? raw.captions
      .map((c) => ({ from: Math.max(0, Number(c?.from) || 0), text: String(c?.text || '').trim().slice(0, 90) }))
      .filter((c) => c.text)
    : [];
  return {
    frames,
    closeupFrom: Number.isFinite(closeupFrom) ? Math.max(0, Math.min(frames.length - 1, closeupFrom)) : Math.max(0, frames.length - 1),
    frameMs: Number.isFinite(frameMs) && frameMs > 80 ? Math.min(3000, frameMs) : 460,
    durations: durations.length === frames.length ? durations : [],
    captions,
    line: typeof raw.line === 'string' ? raw.line.trim().slice(0, 200) : '',
  };
}

// { id, label, name, badge, persona, holo, ... } from a folder, or null when it isn't one
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
  const holo = Number(raw.holo);
  const persona = Array.isArray(raw.persona) ? raw.persona.filter((line) => typeof line === 'string') : (typeof raw.persona === 'string' ? [raw.persona] : []);
  return {
    label: String(raw.label || '').trim().slice(0, 40),
    // who they are to her chat and her panels (a character can be someone else entirely)
    name: String(raw.name || raw.label || '').trim().slice(0, 40),
    badge: String(raw.badge || raw.name || raw.label || '').trim().slice(0, 24).toUpperCase(),
    persona: persona.slice(0, 20),
    // how her menu calls them: "her" (a she) or "him" (a he)
    gender: raw.gender === 'm' ? 'm' : 'f',
    base,
    sprite: url,
    faces: map(base, raw.faces),
    cutins: map(base, raw.cutins),
    // other drawings of the same character, one per pose ("crossed", "smoke"…): her menu switches them
    poses: map(base, raw.poses),
    // a few drawings played once, as a little animation ("glasses": glasses on → taking them off → off)
    sequences: Object.fromEntries(Object.entries(raw.sequences || {})
      .map(([name, list]) => [name, (Array.isArray(list) ? list : []).map((file) => picture(base, file)).filter(Boolean)])
      .filter(([, list]) => list.length > 1)),
    // which poses it takes by itself: { idle: ["smoke", "crouch"], work: "crossed", done: "pistol" }
    auto: Object.fromEntries(Object.entries(raw.auto || {})
      .map(([role, value]) => [role, (Array.isArray(value) ? value : [value]).filter((n) => typeof n === 'string')])
      .filter(([, list]) => list.length)),
    // its own words, one file per language: { "ru": "lines/ru.json" } (deep-merged over hers)
    lines: Object.fromEntries(Object.entries(raw.lines || {})
      .map(([lang, file]) => [lang, jsonFile(dir, file)])
      .filter(([, value]) => value)),
    intro: introOf(base, raw.intro),
    scale: Number.isFinite(scale) && scale > 0 ? Math.min(2, Math.max(0.2, scale)) : null,
    // her shader's colour grade (pinks to hot red, mask to green) is hers: a skin keeps its own colours
    grade: Number.isFinite(grade) ? Math.min(1, Math.max(0, grade)) : null,
    // a projection, like the relic's: cyan, translucent, scanlines (sprite.js)
    holo: Number.isFinite(holo) ? Math.min(1, Math.max(0, holo)) : (raw.holo === true ? 1 : null),
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
