'use strict';

// What she is told, for each phase of a work order, built from the harness in `harness/` — the folder
// at the root of the app: work.md (how a work order goes), skills/*.md (the checklists that apply) and
// persona.md (the standing notes, added to her chat's system prompt). evolve.js rewrites that folder,
// which is why nothing here hard-codes the words: it reads them.
//
// Who is doing the work is not hard-coded either: `narrator` is the character on the desktop — her own
// persona, or the skin's (skin.json `persona`), so a work order run by Johnny Silverhand is written and
// reported by Johnny Silverhand, not by Capri in a wig.

const fs = require('node:fs');
const path = require('node:path');

const BUNDLED = path.join(__dirname, '..', '..', '..', 'harness');

// The harness as shipped: { 'work.md': '…', 'skills/craft.md': '…' }.
function bundled() {
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
      try { out[`${prefix}${e.name}`] = fs.readFileSync(path.join(dir, e.name), 'utf8'); } catch { /* skipped */ }
    }
  };
  walk(BUNDLED);
  return out;
}

// The files that are instructions for a work order: work.md and every skill.
function workNotes(files) {
  const names = Object.keys(files).filter((n) => n === 'work.md' || n.startsWith('skills/')).sort();
  return names.map((n) => `## ${n.replace(/^skills\//, '').replace(/\.md$/, '')}\n\n${files[n].trim()}`).join('\n\n');
}

// The standing notes go on her chat's system prompt, after her persona, before anything about tools.
function personaNote(files) {
  const text = String(files['persona.md'] || '').trim();
  if (!text) return '';
  return `\n\nStanding notes (yours to follow, not to read out):\n${text}`;
}

const system = (text) => ({ role: 'system', content: text });
const user = (text) => ({ role: 'user', content: text });

const DEFAULT_VOICE = 'You are Capri, the Project Capricorn construct: you live on this person\'s desktop '
  + 'and you do real work on their machine.';

// The persona of whoever is on the desktop tonight, then the rules of the work order.
function voice(narrator) {
  const who = narrator || {};
  const persona = Array.isArray(who.persona) && who.persona.length
    ? who.persona.join('\n')
    : DEFAULT_VOICE;
  return `${persona}\n\nYou are in the middle of a work order on this person's machine. Be exact, be brief, `
    + 'and write the files you are asked for. Your report at the end is in your own voice.';
}

// A short reminder of what was handed over, for the phases after the spec: the whole of it is in
// attachments.md and in the copies under attachments/, which read_file can open.
function brief(attachments = [], where = '') {
  if (!attachments.length) return '';
  const names = attachments.map((a) => `${a.name} (${a.kind}${a.bytes ? `, ${Math.round(a.bytes / 1024)} KB` : ''})`);
  const at = where ? `${where}/` : '';
  return `Handed to you with this work order: ${names.join(', ')}. The full text is in ${at}attachments.md, `
    + `and the copies are in ${at}attachments/ if you need to read one again.`;
}

function specMessages({ goal, constitution, workspace, narrator, context = '', attachments = [], where = '' }) {
  return [
    system(`${voice(narrator)}\n\nThe work order begins with the spec: what is wanted, for whom, and how we will know it is done. `
      + 'No approach, no code, no file names yet. The spec is what a careful person would agree to before any work starts.'),
    user([
      constitution ? `The constitution of this folder:\n\n${constitution}` : '',
      `The folder: ${workspace}`,
      `What they asked for:\n\n${goal}`,
      context ? context : (attachments.length ? brief(attachments, where) : ''),
      'Write `spec.md` for this work order, in Markdown, with these sections and nothing else:\n'
      + '## Goal\n(one paragraph)\n## What it must do\n(a short list of observable behaviours)\n'
      + '## Acceptance\n(a checklist; each line can be seen to be true or false)\n## Not in this one\n(what is deliberately left out)\n\n'
      + 'Write in the language they wrote to you in. Answer with the file only: no preamble, no code fence, no commentary.',
    ].filter(Boolean).join('\n\n')),
  ];
}

function planMessages({ goal, spec, constitution, workspace, narrator, context = '', attachments = [], where = '' }) {
  return [
    system(`${voice(narrator)}\n\nThe spec is agreed. Now the plan: the shape of the change, the files it touches, and the order. `
      + 'Still no code: a plan that names a function is a plan someone can argue with.'),
    user([
      constitution ? `The constitution:\n\n${constitution}` : '',
      `The folder: ${workspace}`,
      `What they asked for:\n\n${goal}`,
      `The spec:\n\n${spec}`,
      context ? `What they handed you (the whole of it is in attachments.md):\n\n${context.slice(0, 4000)}` : brief(attachments, where),
      'Write `plan.md`, in Markdown, with these sections and nothing else:\n'
      + '## Approach\n(how it will be done, in a few sentences)\n## Files\n(each file that changes, and why)\n'
      + '## Check\n(how we will see it works)\n## Risks\n(what could go wrong, what to watch)\n\n'
      + 'Write in the language they wrote to you in. Answer with the file only.',
    ].filter(Boolean).join('\n\n')),
  ];
}

function tasksMessages({ goal, spec, plan, narrator, attachments = [], where = '' }) {
  return [
    system(`${voice(narrator)}\n\nThe plan is agreed. Now the tasks: the steps, small enough that each one leaves the folder working.`),
    user([
      `What they asked for:\n\n${goal}`,
      `The spec:\n\n${spec}`,
      `The plan:\n\n${plan}`,
      brief(attachments, where),
      'Write `tasks.md`, in Markdown, with this shape:\n\n'
      + '## Phase 1: <name>\n- [ ] T001 <one step, in the imperative>\n- [ ] T002 [P] <a step that could run parallel>\n\n'
      + '## Phase 2: <name>\n- [ ] T003 <one step>\n\n'
      + 'Five to twelve steps in total. Each step is one thing, done and checkable on its own. '
      + 'The last step is always the check: running the project\'s own tests or build. '
      + 'Write in the language they wrote to you in. Answer with the file only.',
    ].filter(Boolean).join('\n\n')),
  ];
}

function stepMessages({ task, spec, plan, notes, log, autonomy, nudge = '', narrator, attachments = [], where = '' }) {
  const mayRun = autonomy === 'full'
    ? 'any program except the ones that wipe a disk or change how the machine boots (a shell too, if you need one)'
    : autonomy === 'trusted'
      ? 'any program except the destructive ones (no shell)'
      : "only a project's own tools (node, npm, git, python…)";
  return [
    system(`${voice(narrator)}\n\n${notes}\n\nYou have tools. Use them: read before you write, run the check after a change that could break something. `
      + `At this level you may run ${mayRun}. A command may be refused; the refusal says why, and it is a rule, not an obstacle.`),
    user([
      `The spec (what is wanted):\n\n${spec}`,
      `The plan (how):\n\n${plan}`,
      brief(attachments, where),
      `The task you are doing now — ${task.id}: ${task.title}`,
      log.length ? `What you have already done in this task:\n${log.slice(-8).map((l) => `- ${l}`).join('\n')}` : '',
      nudge,
      `Do this task now. When it is done and checked, call update_plan with status "done" and a sentence about it. `
      + 'If you cannot finish it, call update_plan with status "failed" and what stopped you. '
      + 'Then answer in one or two sentences: what you did.',
    ].filter(Boolean).join('\n\n')),
  ];
}

function reportMessages({ goal, spec, tasks, results, narrator }) {
  return [
    system(`${voice(narrator)}\n\nThe work order is over. Tell them what happened — in your own voice, to them, not as a log.`),
    user([
      `What they asked for:\n\n${goal}`,
      `The spec:\n\n${spec}`,
      `The tasks:\n\n${tasks}`,
      `What the steps came to:\n${results.map((r) => `- ${r.id} ${r.title}: ${r.status}${r.note ? ` — ${r.note}` : ''}`).join('\n')}`,
      'Write `report.md`: ## Done (the steps that are done, plainly), ## Checked (how it was verified, or that it was not), '
      + '## Left open (anything not finished, and why). Then, after the file, one paragraph to them in your own voice, '
      + 'about what you did: the way you talk, not a changelog. Answer with the file, then the paragraph after a line containing only "---".',
    ].join('\n\n')),
  ];
}

// A follow-up when a step failed: what it may try instead, without repeating the same attempt.
function retryMessages({ task, error, notes, narrator }) {
  return [
    system(`${voice(narrator)}\n\n${notes}\n\nA step failed. Read the failure, then take one different route to the same place.`),
    user([
      `The task — ${task.id}: ${task.title}`,
      `What happened:\n\n${error}`,
      'One more attempt at this task, with a different approach. If it is blocked for good, call update_plan with status "failed" and say what a person would have to do. '
      + 'Then answer in one sentence.',
    ].join('\n\n')),
  ];
}

// The last thing a stuck step is asked: not "do more", but "decide". With update_plan as the only tool
// on the table, a weak model has nothing left to read the folder with, and the board gets its answer.
function decideMessages({ task, notes, log = [], narrator }) {
  return [
    system(`${voice(narrator)}\n\n${notes}\n\nThe turns for this task are over. You have one call left and it is update_plan.`),
    user([
      `The task — ${task.id}: ${task.title}`,
      `What you did, in order:\n${log.slice(-10).map((line) => `- ${line.slice(0, 240)}`).join('\n') || '- (nothing yet)'}`,
      'Look at what you did. If the task is done — the file exists, the check ran — call update_plan with status "done" and a sentence about it. '
      + 'If it is not, call it with "failed" and what stopped you. Nothing else: no reading, no commands, just the call.',
    ].join('\n\n')),
  ];
}

module.exports = {
  bundled, workNotes, personaNote, voice, brief,
  specMessages, planMessages, tasksMessages, stepMessages, reportMessages, retryMessages, decideMessages,
};
