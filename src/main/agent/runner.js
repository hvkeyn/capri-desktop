'use strict';

// A work order, from the sentence that started it to the report at the end.
//
// The runner owns the order of the phases and nothing else: it asks her model for the spec, then the
// plan, then the tasks, then hands each task to the model with the tools of the folder (fsx.js,
// exec.js) and waits for it to say the task is done. Every change it makes goes through `Plan`, which
// is what the board is drawing: if it isn't on the board, it didn't happen.
//
// `ask` is the model, passed in: { messages, tools, signal } -> { text, toolCalls }. tests/agent.test.js
// hands it a script instead of a server, which is why nothing in here imports Electron or llm.js.

const path = require('node:path');
const fs = require('node:fs');
const guard = require('./guard');
const fsx = require('./fsx');
const exec = require('./exec');
const spec = require('./spec');
const prompts = require('./prompts');
const attach = require('./attach');
const { Plan } = require('./plan');

const TOOL_ROUNDS = 8; // one task may take this many model turns before it is called stuck
const FENCE = /^\s*```[a-z]*\s*\n([\s\S]*?)\n\s*```\s*$/i;

// What the model may do inside the folder, as function-calling schemas.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file of the folder. Read a file before you change it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'relative to the folder of the work order' },
          offset: { type: 'integer', description: 'byte to start at (default 0)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a whole text file (created or replaced). Prefer patch_file for a small change.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description: 'Replace one piece of text in a file. The text must be there exactly once, or the patch is refused.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          find: { type: 'string', description: 'exact text as it is in the file' },
          replace: { type: 'string', description: 'what it becomes (empty deletes it)' },
        },
        required: ['path', 'find', 'replace'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'The files and folders in a folder of the work order.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'default: the folder itself' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Find text in the folder: every matching line, with file and line number.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'plain text, or /regex/ with slashes' },
          path: { type: 'string', description: 'folder to search under (default: all of it)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: "Run a command in the folder: the project's tests, its build, its linter, git. No shell: quotes only.",
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'e.g. "npm test" or "git status --short"' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Mark this task done or failed, with one sentence. Call it when the task is finished (and checked) or blocked.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['done', 'failed'] },
          note: { type: 'string', description: 'one sentence: what you did, or what stopped you' },
        },
        required: ['status', 'note'],
      },
    },
  },
];

const stripFence = (text) => {
  const source = String(text || '').trim();
  const fenced = FENCE.exec(source);
  return (fenced ? fenced[1] : source).trim();
};

const tokens = (text) => Math.ceil(String(text || '').length / 4);

class Runner {
  constructor({ ask, store, emit = () => {}, autonomy = 'guard', clock = () => Date.now(), maxToolRounds = TOOL_ROUNDS, narrator = null }) {
    this.ask = ask;
    this.store = store;
    this.emit = emit;
    this.autonomy = autonomy;
    this.clock = clock;
    this.maxToolRounds = maxToolRounds;
    this.narrator = narrator; // who is on the desktop tonight: { name, persona } (skin.json)
    this.abort = new AbortController();
    this.plan = null;
    this.dir = null;
    this.specText = '';
    this.planText = '';
    this.tasksText = '';
    this.context = ''; // what was handed over, as the prompt reads it
    this.attachments = [];
    this.spent = 0; // estimated tokens of model calls, for the report
    this.completion = null;
  }

  get signal() {
    return this.abort.signal;
  }

  // Starts the work order and returns at once with the plan's first snapshot: the board opens on it
  // while the rest happens behind it. `completion` resolves when the last phase is over.
  start({ goal, workspace, attachments = [], narrator = null }) {
    this.plan = new Plan({ id: `work-${this.clock()}`, goal, workspace: path.resolve(workspace || guard.defaultWorkspace()) });
    this.narrator = narrator || this.narrator;
    this.attachments = Array.isArray(attachments) ? attachments : [];
    this.plan.give(this.attachments);
    this.completion = this.run().catch((err) => this.finishWithError(err));
    return this.snapshot();
  }

  snapshot() {
    return this.plan ? this.plan.snapshot() : null;
  }

  push() {
    const snap = this.snapshot();
    if (!snap) return snap;
    if (this.dir) spec.saveState(this.dir, snap); // specs/001-…/state.json: the board after a restart
    this.store?.savePlan?.(snap);
    this.emit(snap);
    return snap;
  }

  stop() {
    this.abort.abort();
    if (this.plan && this.plan.status === 'running') this.finishWithError(new Error('stopped'), 'stopped');
  }

  async run() {
    const { workspace, goal } = this.plan;
    fs.mkdirSync(workspace, { recursive: true });
    spec.scaffold(workspace);
    const constitution = spec.readConstitution(workspace);
    const feature = spec.feature(workspace, goal);
    this.dir = feature.dir;
    this.where = path.relative(workspace, this.dir).split(path.sep).join('/'); // 'specs/001-…', as read_file sees it
    this.plan.id = feature.id;
    this.plan.slug = feature.id;
    this.notes = prompts.workNotes(prompts.bundled());
    // what you handed over becomes a block in the prompt, a copy in the feature folder and a note on
    // the board; a picture with no vision pass is named as one rather than silently dropped
    if (this.attachments.length) {
      this.context = attach.prepare(this.dir, this.attachments, workspace).context;
      this.plan.note(`${this.attachments.length} handed over`, 'note');
    }
    this.push();

    // 1. the spec
    this.plan.setPhase('spec').note('writing the spec', 'note');
    this.push();
    this.specText = stripFence(await this.tell(prompts.specMessages({
      goal, constitution, workspace, narrator: this.narrator, context: this.context, attachments: this.attachments, where: this.where,
    })));
    spec.write(this.dir, 'spec.md', `${this.specText}\n`);
    this.plan.note('spec.md written', 'file');
    this.push();
    this.throwIfStopped();

    // 2. the plan
    this.plan.setPhase('plan').note('writing the plan', 'note');
    this.push();
    this.planText = stripFence(await this.tell(prompts.planMessages({
      goal, spec: this.specText, constitution, workspace, narrator: this.narrator, context: this.context, attachments: this.attachments, where: this.where,
    })));
    spec.write(this.dir, 'plan.md', `${this.planText}\n`);
    this.plan.note('plan.md written', 'file');
    this.push();
    this.throwIfStopped();

    // 3. the tasks
    this.plan.setPhase('tasks').note('breaking it into steps', 'note');
    this.push();
    this.tasksText = stripFence(await this.tell(prompts.tasksMessages({
      goal, spec: this.specText, plan: this.planText, narrator: this.narrator, attachments: this.attachments, where: this.where,
    })));
    spec.write(this.dir, 'tasks.md', `${this.tasksText}\n`);
    const parsed = spec.parseTasks(this.tasksText);
    this.plan.addSteps(parsed.tasks);
    this.plan.note(`${parsed.tasks.length} steps`, 'note');
    this.push();
    this.throwIfStopped();

    // 4. the build, one task at a time
    this.plan.setPhase('build');
    this.push();
    for (const step of this.plan.steps) {
      this.throwIfStopped();
      await this.buildStep(step);
      if (step.status !== 'done') {
        for (const rest of this.plan.steps) if (rest.status === 'queued') this.plan.skip(rest.id, `${step.id} ${step.status}`);
        this.plan.halt(`${step.id}: ${step.note || step.status}`);
        this.push();
        await this.writeReport();
        return this.push();
      }
    }

    // 5. the report
    await this.writeReport();
    this.plan.done();
    this.plan.note(`done · ${Math.round(this.plan.elapsedMs / 1000)} s`, 'note');
    this.push();
    this.store?.observe?.({
      kind: 'work',
      text: `Work order finished: ${this.plan.goal}`,
      meta: { id: this.plan.id, status: this.plan.status, steps: this.plan.steps.length, tokens: this.spent },
    });
    return this.snapshot();
  }

  // One task, its own tool loop: read, change, check, until she says it's done or the rounds run out.
  async buildStep(step) {
    this.plan.start(step.id).setPhase('build');
    this.plan.note(`${step.id} · ${step.title}`, 'note');
    this.push();
    const log = [];
    let repeats = 0;
    let lastCall = '';
    for (let round = 0; round < this.maxToolRounds; round++) {
      this.throwIfStopped();
      // a weak model can keep reading the same folder forever: after a couple of rounds it is told,
      // in plain words, that the information is in and the only useful call left is update_plan
      const nudge = round >= 2
        ? 'You have already looked at the folder. Do not call read_file, list_dir or search_files again. '
          + 'If the task is done, call update_plan now with status "done"; if it is impossible, call it with "failed".'
        : '';
      const messages = prompts.stepMessages({
        task: step, spec: this.specText, plan: this.planText, notes: this.notes, log, autonomy: this.autonomy, nudge,
        narrator: this.narrator, attachments: this.attachments, where: this.where,
      });
      const res = await this.turn(messages, TOOLS);
      if (res.text) log.push(res.text.slice(0, 400));
      if (!res.toolCalls?.length) {
        // no tool, no "done": she talked instead of working. One more go at it, then it's stuck.
        if (step.status === 'running' && round + 1 < this.maxToolRounds) {
          log.push('(no tool call: trying again)');
          continue;
        }
        break;
      }
      // the same call twice means the folder told her everything it can: don't spend the round again
      const key = res.toolCalls.map((c) => `${c.name}:${c.arguments}`).join('|');
      if (key === lastCall) repeats += 1; else repeats = 0;
      lastCall = key;
      if (repeats >= 2) {
        log.push('(the same calls again: nothing new to learn, finish the task)');
        break;
      }
      for (const call of res.toolCalls) {
        const result = await this.use(call, step);
        log.push(`${call.name}: ${JSON.stringify(result).slice(0, 300)}`);
        if (step.status !== 'running') break;
      }
      if (step.status !== 'running') break;
    }
    if (step.status === 'running') {
      // Out of rounds, or a model that keeps reading instead of deciding. The last turn is not "do more":
      // update_plan is the only tool on the table, so the answer can only be done or failed — and the
      // board gets one either way, instead of a step that hangs at running forever.
      const decision = await this.turn(
        prompts.decideMessages({ task: step, notes: this.notes, log, narrator: this.narrator }),
        [TOOLS.find((tool) => tool.function.name === 'update_plan')],
      );
      for (const call of decision.toolCalls || []) {
        await this.use(call, step);
        if (step.status !== 'running') break;
      }
      if (step.status === 'running') this.plan.fail(step.id, 'ran out of turns without deciding');
    }
    if (step.status === 'done') spec.tick(this.dir, step.id);
    this.plan.note(`${step.id} ${step.status}`, step.status === 'done' ? 'note' : 'error');
    this.push();
    return step;
  }

  // An answer with the tools on the table: { text, toolCalls }. A refusal from the server is a failed
  // phase, not a crash: the board says what happened and the work stops there.
  async turn(messages, tools) {
    const res = await this.ask({ messages, tools, signal: this.signal });
    this.spent += tokens(messages.map((m) => m.content).join(' ')) + tokens(res.text);
    return res;
  }

  // The phases that are only writing: no tools, just the file she was asked to write.
  async tell(messages) {
    const res = await this.ask({ messages, tools: [], signal: this.signal });
    this.spent += tokens(messages.map((m) => m.content).join(' ')) + tokens(res.text);
    if (!String(res.text || '').trim()) throw new Error('the model answered nothing');
    return res.text;
  }

  // One tool call, checked and run, and what the model gets back.
  async use(call, step) {
    let args = {};
    try { args = JSON.parse(call.arguments || '{}'); } catch { /* no arguments */ }
    const name = call.name;
    const root = this.plan.workspace;
    let out;
    switch (name) {
      case 'read_file':
        out = fsx.read(root, args.path, { offset: Number(args.offset) || 0 });
        if (out.ok) this.plan.note(`READ ${args.path}`, 'file');
        break;
      case 'write_file':
        out = fsx.write(root, args.path, args.content);
        if (out.ok) this.plan.note(`WRITES ${args.path}`, 'file');
        break;
      case 'patch_file':
        out = fsx.patch(root, args.path, args.find, args.replace);
        if (out.ok) this.plan.note(`PATCHES ${args.path}`, 'file');
        break;
      case 'list_dir':
        out = fsx.list(root, args.path || '.');
        if (out.ok) this.plan.note(`LIST ${args.path || '.'}`, 'file');
        break;
      case 'search_files':
        out = fsx.search(root, args.pattern, { rel: args.path || '.' });
        if (out.ok) this.plan.note(`GREPS ${JSON.stringify(args.pattern)}`, 'file');
        break;
      case 'run_command': {
        const shown = guard.show(guard.parseCommand(args.command).argv || [args.command]);
        this.plan.note(`RUNS ${shown}`, 'run');
        out = await exec.run(args.command, { root, autonomy: this.autonomy });
        this.plan.note(`${out.ok ? 'ok' : 'exit'} · ${Math.round((out.ms || 0) / 100) / 10} s`, out.ok ? 'note' : 'error');
        break;
      }
      case 'update_plan':
        if (args.status === 'done') this.plan.finish(step.id, args.note || '');
        else this.plan.fail(step.id, args.note || 'failed');
        this.plan.note(`${step.id} ${args.status}: ${args.note || ''}`.slice(0, 200), args.status === 'done' ? 'note' : 'error');
        out = { ok: true };
        break;
      default:
        out = { ok: false, error: `no such tool: ${name}` };
    }
    this.push();
    return out;
  }

  async writeReport() {
    this.plan.setPhase('report');
    this.push();
    try {
      const text = await this.tell(prompts.reportMessages({
        goal: this.plan.goal, spec: this.specText, tasks: this.tasksText, narrator: this.narrator,
        results: this.plan.steps.map((s) => ({ id: s.id, title: s.title, status: s.status, note: s.note })),
      }));
      const [file, ...rest] = text.split(/\n-{3,}\s*\n/);
      spec.write(this.dir, 'report.md', `${String(file || '').trim()}\n`);
      const spoken = rest.join('\n').trim();
      if (spoken) this.plan.summary = spoken.slice(0, 1600); // the report has to end on a sentence, not a cut
      this.plan.note('report.md written', 'file');
    } catch (err) {
      this.plan.note(`no report: ${err.message}`, 'error');
    }
    return this.push();
  }

  throwIfStopped() {
    if (this.signal.aborted) throw new Error('stopped');
  }

  finishWithError(err, status = 'failed') {
    if (!this.plan) return null;
    if (err?.name === 'AbortError' || /stopped/.test(err?.message || '')) status = 'stopped';
    this.plan.halt(err?.message || 'failed', status);
    return this.push();
  }
}

module.exports = { Runner, TOOLS, stripFence };
