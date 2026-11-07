'use strict';

// The lines a character has beyond the ones shipped in its skin: written by the model, kept on disk, and
// used when there is no model at all (offline, or a provider that is down). One file per character and
// language, so switching either keeps its own words.

const fs = require('node:fs');
const path = require('node:path');

const MAX_PER_KIND = 60; // beyond this, more lines stop helping and start bloating the file
const MAX_LINE = 160;

const file = (base, character, lang) => path.join(base, 'lines', `${String(character || 'capri')}-${String(lang || 'en')}.json`);

// Only what a line pool can hold: a kind, a list of short strings, no repeats.
function sanitize(packs) {
  const out = {};
  for (const [kind, list] of Object.entries(packs && typeof packs === 'object' ? packs : {})) {
    if (!/^[a-z][a-z0-9_]{0,30}$/i.test(kind) || !Array.isArray(list)) continue;
    const seen = new Set();
    const lines = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const line = item.replace(/\s+/g, ' ').trim().replace(/^[-•*\d.\s]+/, '');
      if (!line || line.length > MAX_LINE || seen.has(line.toLowerCase())) continue;
      seen.add(line.toLowerCase());
      lines.push(line);
      if (lines.length >= MAX_PER_KIND) break;
    }
    if (lines.length) out[kind] = lines;
  }
  return out;
}

function load(base, character, lang) {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file(base, character, lang), 'utf8')));
  } catch {
    return {};
  }
}

// Add to what is there: the new lines go after the old ones, duplicates (by text, in either direction) are
// dropped, and each kind stops at MAX_PER_KIND.
function merge(base, character, lang, packs) {
  const current = load(base, character, lang);
  const incoming = sanitize(packs);
  const merged = { ...current };
  for (const [kind, lines] of Object.entries(incoming)) {
    const known = new Set((merged[kind] || []).map((l) => l.toLowerCase()));
    const next = [...(merged[kind] || [])];
    for (const line of lines) {
      if (known.has(line.toLowerCase())) continue;
      known.add(line.toLowerCase());
      next.push(line);
    }
    merged[kind] = next.slice(0, MAX_PER_KIND);
  }
  try {
    fs.mkdirSync(path.join(base, 'lines'), { recursive: true });
    fs.writeFileSync(file(base, character, lang), JSON.stringify(merged, null, 2));
    return { ok: true, packs: merged, added: Object.fromEntries(Object.entries(incoming).map(([k, v]) => [k, Math.min(v.length, (merged[k] || []).length)])) };
  } catch (err) {
    return { ok: false, error: err.message, packs: merged };
  }
}

function count(base, character, lang) {
  const packs = load(base, character, lang);
  return Object.fromEntries(Object.entries(packs).map(([kind, lines]) => [kind, lines.length]));
}

module.exports = { MAX_PER_KIND, MAX_LINE, file, sanitize, load, merge, count };
