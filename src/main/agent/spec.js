'use strict';

// The paperwork of a work order, laid out the way GitHub's spec-kit (github/spec-kit) lays it out:
//
//   .specify/memory/constitution.md     how she works, for every work order in this folder
//   specs/001-slug/spec.md              what is wanted, and what "done" means
//   specs/001-slug/plan.md              how it will be done, and what it touches
//   specs/001-slug/tasks.md             the steps, as a checklist (T001, T002…)
//   specs/001-slug/state.json           where the run is right now (the board reads this)
//   specs/001-slug/report.md            what happened, at the end
//
// Spec before plan, plan before tasks, tasks before a single file is touched: that order is the whole
// point. It is what keeps a model from starting to type and then finding out what it was asked to do.

const fs = require('node:fs');
const path = require('node:path');

const PHASES = ['spec', 'plan', 'tasks', 'build', 'report'];
const DIR = 'specs';
const SPECIFY = path.join('.specify', 'memory');

const CONSTITUTION = `# Constitution

How work gets done in this folder. Every work order reads this first.

## The order of work

1. **The spec says what.** What is wanted, for whom, and how we will know it is done. No approach yet.
2. **The plan says how.** The shape of the solution, the files it touches, what it does not touch.
3. **The tasks say in what order.** Small steps that can each be finished and checked on their own.
4. **Only then, the build.** One task at a time, each one left in a state that still runs.

## While building

- The smallest change that does the thing. Nothing renamed or reformatted along the way.
- Read before you write. If a patch doesn't bite exactly once, read the file again.
- Run the project's own check after a step that could break it — its tests, its build, its linter.
- Leave the folder tidy: no scratch files, no commented-out code, no "TODO" left behind.
- Outside this folder, nothing. Not a file of the machine's, not a setting of it.

## When something is not clear

Say so, and ask. A wrong guess costs more than a question.
`;

// A folder name from a goal: "Поправь шапку сайта" -> "poprav-shapku-sayta". Enough of a transliteration
// for Russian to keep a folder readable; anything else is latinised as it comes.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slug(text, fallback = 'work') {
  const latin = String(text || '').toLowerCase().replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? '');
  const cut = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return cut || fallback;
}

const specsDir = (workspace) => path.join(workspace, DIR);

// The next feature's number, so 001, 002… read in the order they were asked for.
function nextNumber(workspace) {
  let most = 0;
  try {
    for (const name of fs.readdirSync(specsDir(workspace))) {
      const n = Number(/^(\d{3})/.exec(name)?.[1]);
      if (n > most) most = n;
    }
  } catch {
    // no specs yet
  }
  return String(most + 1).padStart(3, '0');
}

function scaffold(workspace) {
  const dir = path.join(workspace, SPECIFY);
  const file = path.join(dir, 'constitution.md');
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, CONSTITUTION);
  } catch {
    // read-only folder: the constitution stays the one in memory (prompts.js)
  }
  return file;
}

const readConstitution = (workspace) => {
  try {
    return fs.readFileSync(path.join(workspace, SPECIFY, 'constitution.md'), 'utf8');
  } catch {
    return CONSTITUTION;
  }
};

function feature(workspace, goal) {
  const n = nextNumber(workspace);
  const name = `${n}-${slug(goal)}`;
  const dir = path.join(specsDir(workspace), name);
  fs.mkdirSync(dir, { recursive: true });
  return { id: name, number: n, dir };
}

const write = (dir, file, text) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), String(text ?? ''));
  return path.join(dir, file);
};

// tasks.md, as spec-kit writes it: a phase header, then a checklist of T-numbered steps. A step marked
// [P] can go in parallel with its neighbours; the runner still does them one at a time, in order.
function parseTasks(markdown) {
  const tasks = [];
  let phase = 'Build';
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^#{2,4}\s+(?:Phase\s*[\d.:]*\s*)?(.+)$/i.exec(line);
    if (heading) {
      phase = heading[1].replace(/^\d+\.\s*/, '').trim() || phase;
      continue;
    }
    const item = /^\s*[-*]\s*\[( |x|X)\]\s*(T\d{2,4})?\s*(?:\[P\])?\s*(.+)$/.exec(line);
    if (!item) continue;
    const id = item[2] || `T${String(tasks.length + 1).padStart(3, '0')}`;
    tasks.push({
      id,
      title: item[3].replace(/\s+/g, ' ').trim(),
      parallel: /\[P\]/.test(line),
      phase,
      done: item[1].toLowerCase() === 'x',
    });
  }
  return { phases: [...new Set(tasks.map((t) => t.phase))], tasks };
}

// A step ticked in tasks.md, so the file on disk stays the record of what was done.
function tick(dir, id) {
  const file = path.join(dir, 'tasks.md');
  try {
    const text = fs.readFileSync(file, 'utf8');
    const next = text.replace(new RegExp(`(^\\s*[-*]\\s*)\\[ \\](\\s*${id}\\b)`, 'm'), '$1[x]$2');
    if (next !== text) fs.writeFileSync(file, next);
  } catch {
    // a work order without a tasks.md on disk: the state.json is still the record
  }
}

const stateFile = (dir) => path.join(dir, 'state.json');

function saveState(dir, state) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile(dir), JSON.stringify(state, null, 2));
  } catch {
    // the run still goes on in memory
  }
  return state;
}

function loadState(dir) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(dir), 'utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  PHASES, DIR, CONSTITUTION, slug, nextNumber, scaffold, readConstitution, feature, write,
  parseTasks, tick, saveState, loadState, stateFile,
};
