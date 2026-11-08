'use strict';

// Skills: a shelf of short instructions, one per kind of job, that the model picks from itself. What goes
// into every prompt is only the catalog — name, what it is for, when to take it — and the whole text is
// loaded when the model asks for it with use_skill. That is the bargain DeepSeek Harness makes: the
// prompt stays a page, and the shelf can be as long as it likes.
//
// A skill is a markdown file in harness/skills/ (hers, in her storage, seeded from the app), with a small
// front matter block:
//
//   ---
//   name: research
//   description: how to gather facts and check them
//   when: news, sources, prices, what happened, check, verify
//   ---
//   …the instructions…
//
// `when` is a comma-separated list of words: the runner uses it to point at the skill that fits this step.

const FRONT = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

const firstLine = (text) => String(text || '').split('\n').map((line) => line.replace(/^#+\s*/, '').trim()).find(Boolean) || '';

function parse(text, file = '') {
  const raw = String(text || '');
  const meta = {};
  const m = FRONT.exec(raw);
  const body = m ? raw.slice(m[0].length) : raw;
  if (m) {
    for (const line of m[1].split('\n')) {
      const at = line.indexOf(':');
      if (at < 0) continue;
      const key = line.slice(0, at).trim().toLowerCase();
      const value = line.slice(at + 1).trim();
      if (key && value) meta[key] = value;
    }
  }
  const fromFile = file.replace(/^skills\//, '').replace(/\.md$/i, '');
  return {
    name: (meta.name || fromFile || 'skill').trim(),
    description: (meta.description || firstLine(body)).trim(),
    when: (meta.when || meta.whentouse || '').trim(),
    body: body.trim(),
    file,
  };
}

// Every skill of a harness, in name order.
function catalog(files = {}) {
  return Object.keys(files)
    .filter((name) => name.startsWith('skills/') && /\.md$/i.test(name))
    .sort()
    .map((file) => parse(files[file], file));
}

// The shelf as the model reads it with every step: short enough to keep, long enough to choose from.
function catalogText(files = {}) {
  const list = catalog(files);
  if (!list.length) return '';
  return list.map((skill) => `- **${skill.name}** — ${skill.description}${skill.when ? ` (take it for: ${skill.when})` : ''}`).join('\n');
}

// A skill by name, or by the word the model used: "research", "research.md", "Research".
function find(files = {}, name = '') {
  const want = String(name || '').trim().toLowerCase().replace(/^skills\//, '').replace(/\.md$/i, '');
  if (!want) return null;
  const list = catalog(files);
  return list.find((skill) => skill.name.toLowerCase() === want || skill.file.toLowerCase().replace(/^skills\//, '').replace(/\.md$/i, '') === want) || null;
}

// Which skills look like this job: the words in `when` and the name, against the step and the goal.
// It is only a pointer — the model still decides, and can load any skill it likes.
function suggest(files = {}, text = '') {
  const hay = String(text || '').toLowerCase();
  if (!hay) return [];
  return catalog(files).filter((skill) => {
    const words = `${skill.name} ${skill.when}`.toLowerCase().split(/[,;]+/).map((w) => w.trim()).filter((w) => w.length > 2);
    return words.some((word) => hay.includes(word));
  }).slice(0, 2);
}

module.exports = { parse, catalog, catalogText, find, suggest };
