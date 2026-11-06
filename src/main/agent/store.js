'use strict';

// Where her own working memory lives, outside the repo and outside the folder she works in:
//
//   agent/harness/            what she is told to be and how she works (evolve.js edits this)
//   agent/observations.jsonl  what you said to her, and where she missed (evolve.js reads this)
//   agent/evolution/          the edits she has tried, the ones that stuck, and their backups
//   agent/plans/              the last work orders, one file each, so a restart doesn't lose the board
//
// Everything here is yours, on your machine: nothing in this folder is ever sent anywhere except as a
// prompt she is answering.

const fs = require('node:fs');
const path = require('node:path');

const OBSERVE_MAX = 1200; // observations kept; the file is trimmed to this when it grows past it

const at = (...parts) => path.join(...parts);

function ensure(base, defaults = {}) {
  for (const dir of ['harness', 'harness/skills', 'evolution', 'plans']) {
    try { fs.mkdirSync(at(base, ...dir.split('/')), { recursive: true }); } catch { /* read-only */ }
  }
  // the bundled harness is written once: after that it is hers, and evolve.js may rewrite it
  for (const [name, text] of Object.entries(defaults)) {
    const file = at(base, 'harness', ...name.split('/'));
    try {
      if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, String(text));
      }
    } catch { /* read-only */ }
  }
  return base;
}

const harnessDir = (base) => at(base, 'harness');

// Every file of the harness, as { 'persona.md': '…', 'skills/craft.md': '…' }.
function harness(base) {
  const out = {};
  const walk = (dir, prefix = '') => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) { walk(path.join(dir, e.name), `${prefix}${e.name}/`); continue; }
      if (!/\.md$/i.test(e.name)) continue;
      try {
        out[`${prefix}${e.name}`] = fs.readFileSync(path.join(dir, e.name), 'utf8');
      } catch { /* skipped */ }
    }
  };
  walk(harnessDir(base));
  return out;
}

function writeHarness(base, name, text) {
  const file = at(base, 'harness', ...String(name).split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(text ?? ''));
  return file;
}

// One observation: { kind: 'message' | 'answer' | 'correction' | 'work' | 'feedback', text, meta }.
function observe(base, entry) {
  if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) return false;
  const row = {
    at: new Date().toISOString(),
    kind: String(entry.kind || 'message'),
    text: entry.text.replace(/\s+/g, ' ').trim().slice(0, 800),
    meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : undefined,
  };
  try {
    fs.mkdirSync(base, { recursive: true });
    fs.appendFileSync(at(base, 'observations.jsonl'), `${JSON.stringify(row)}\n`);
    trim(base);
    return true;
  } catch {
    return false;
  }
}

function trim(base) {
  const file = at(base, 'observations.jsonl');
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= OBSERVE_MAX) return;
    fs.writeFileSync(file, `${lines.slice(-OBSERVE_MAX).join('\n')}\n`);
  } catch { /* nothing to trim */ }
}

function observations(base, limit = 200) {
  let lines = [];
  try {
    lines = fs.readFileSync(at(base, 'observations.jsonl'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  return lines.slice(-limit).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function history(base) {
  try {
    return fs.readFileSync(at(base, 'evolution', 'history.jsonl'), 'utf8').split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

function appendHistory(base, record) {
  try {
    fs.mkdirSync(at(base, 'evolution'), { recursive: true });
    fs.appendFileSync(at(base, 'evolution', 'history.jsonl'), `${JSON.stringify(record)}\n`);
    return true;
  } catch {
    return false;
  }
}

function evolutionState(base) {
  try {
    return JSON.parse(fs.readFileSync(at(base, 'evolution', 'state.json'), 'utf8'));
  } catch {
    return { rounds: 0, pruned: [], delta: null, accepted: 0, rejected: 0 };
  }
}

function saveEvolutionState(base, state) {
  try {
    fs.mkdirSync(at(base, 'evolution'), { recursive: true });
    fs.writeFileSync(at(base, 'evolution', 'state.json'), JSON.stringify(state, null, 2));
  } catch { /* nothing to save */ }
  return state;
}

// The harness before a round's edits, so a bad acceptance is one restore away.
function backup(base, label) {
  const dir = at(base, 'evolution', 'backups', String(label).replace(/[^0-9a-z-]/gi, ''));
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(harness(base))) {
      const file = at(dir, ...name.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    return dir;
  } catch {
    return null;
  }
}

function restore(base, label) {
  const dir = at(base, 'evolution', 'backups', String(label).replace(/[^0-9a-z-]/gi, ''));
  let restored = 0;
  const walk = (from, prefix = '') => {
    let entries;
    try {
      entries = fs.readdirSync(from, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) { walk(path.join(from, e.name), `${prefix}${e.name}/`); continue; }
      try {
        writeHarness(base, `${prefix}${e.name}`, fs.readFileSync(path.join(from, e.name), 'utf8'));
        restored += 1;
      } catch { /* skipped */ }
    }
  };
  walk(dir);
  return restored;
}

function savePlan(base, snapshot) {
  if (!snapshot?.id) return null;
  const file = at(base, 'plans', `${String(snapshot.id)}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    return file;
  } catch {
    return null;
  }
}

function lastPlan(base) {
  let entries = [];
  try {
    entries = fs.readdirSync(at(base, 'plans')).filter((n) => n.endsWith('.json'));
  } catch {
    return null;
  }
  let newest = null;
  let at2 = 0;
  for (const name of entries) {
    try {
      const stat = fs.statSync(at(base, 'plans', name));
      if (stat.mtimeMs > at2) { at2 = stat.mtimeMs; newest = name; }
    } catch { /* gone */ }
  }
  if (!newest) return null;
  try {
    return JSON.parse(fs.readFileSync(at(base, 'plans', newest), 'utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  ensure, harness, writeHarness, observe, observations, history, appendHistory,
  evolutionState, saveEvolutionState, backup, restore, savePlan, lastPlan, harnessDir,
};
