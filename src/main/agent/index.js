'use strict';

// The part of her that works, in one place: the harness on disk, a work order at a time, and the
// rounds where she edits her own harness. main.js only talks to this; how a phase is run is runner.js's
// business, and what she may touch is guard.js's.

const path = require('node:path');
const store = require('./store');
const prompts = require('./prompts');
const guard = require('./guard');
const spec = require('./spec');
const { Runner } = require('./runner');
const { Evolver } = require('./evolve');
const { Plan } = require('./plan');

// The words a round of evolution is scored against, when nothing better is on hand: a judge that reads
// her answer next to your correction and says how much of it she would have needed.
function judgeMessages({ input, output, better }) {
  return [
    { role: 'system', content: 'You grade how well an assistant\'s answer stands up to the correction a person made afterwards. You are strict and you answer with one number.' },
    {
      role: 'user',
      content: [
        `What the person asked:\n${input}`,
        `What the assistant answered:\n${output}`,
        `How the person corrected it afterwards:\n${better}`,
        'How much of that correction would the answer have needed? 100: the answer already satisfies it, nothing to correct. '
        + '0: it missed everything the correction is about. Answer with the number only.',
      ].join('\n\n'),
    },
  ];
}

class Agent {
  constructor({ base, ask, judge = null, emit = () => {}, autonomy = () => 'guard', narrator = null, clock = () => Date.now() }) {
    this.base = base;
    this.ask = ask;
    this.judge = judge;
    this.emit = emit;
    this.autonomy = autonomy;
    this.narrator = narrator; // () => ({ name, persona }): who reports, from the character on the desktop
    this.clock = clock;
    this.runner = null;
    this.evolver = null;
    this.plan = null;
  }

  // First run: the harness in `harness/` is copied into her own storage, then it's hers.
  ensure() {
    store.ensure(this.base, prompts.bundled());
    return this;
  }

  get harnessDir() {
    return store.harnessDir(this.base);
  }

  get autonomyLevel() {
    const level = typeof this.autonomy === 'function' ? this.autonomy() : this.autonomy;
    return level === 'trusted' ? 'trusted' : 'guard';
  }

  // Her standing notes, for the end of her chat's system prompt.
  personaNote() {
    return prompts.personaNote(store.harness(this.base));
  }

  observe(entry) {
    return store.observe(this.base, entry);
  }

  // The conversation as she has it now, and the correction you may have just made: if your message
  // starts by telling her she got it wrong, that's a case for evolve.js, not just a new message.
  observeChat({ message, previous = '', answer = '' }) {
    const text = String(message || '').trim();
    if (!text) return;
    const correction = /^(нет|не так|не то|неправильно|неверно|no[,!.]?\s|nope|wrong|not what|that'?s not|не о том)/i.test(text);
    if (correction) {
      this.observe({
        kind: 'correction',
        text,
        meta: { input: String(previous || '').slice(0, 600), answer: String(answer || '').slice(0, 600) },
      });
    } else {
      this.observe({ kind: 'message', text });
    }
  }

  // A work order. Returns the first snapshot; the run continues in the background and every change
  // comes out of `emit` as a full state, which is what the board draws.
  startWork({ goal, workspace, attachments = [] }) {
    if (this.runner && this.plan?.status === 'running') return { ok: false, error: 'a work order is already running' };
    const root = path.resolve(String(workspace || '').trim() || guard.defaultWorkspace());
    const narrator = typeof this.narrator === 'function' ? this.narrator() : this.narrator;
    this.runner = new Runner({
      ask: (req) => this.ask(req),
      // the runner writes through her storage, not to a path of its own
      store: {
        savePlan: (state) => store.savePlan(this.base, state),
        observe: (entry) => store.observe(this.base, entry),
      },
      emit: (state) => { this.plan = state; this.emit(state); },
      autonomy: this.autonomyLevel,
      clock: this.clock,
      narrator,
      harness: store.harness(this.base), // her own shelf of skills, seeded from the app and hers to edit
    });
    this.plan = this.runner.start({ goal: String(goal || '').trim() || 'What they asked for', workspace: root, attachments, narrator });
    this.observe({ kind: 'work', text: `Work order started: ${this.plan.goal}`, meta: { id: this.plan.id, workspace: root, attachments: attachments.length } });
    return { ok: true, plan: this.plan };
  }

  stopWork() {
    this.runner?.stop();
    return this.plan;
  }

  // Where the last board was, for a restart or a second look from her menu.
  lastPlan() {
    const found = store.lastPlan(this.base);
    if (!found) return null;
    const plan = new Plan({ id: found.id, goal: found.goal, workspace: found.workspace, slug: found.slug });
    Object.assign(plan, {
      phase: found.phase, status: found.status, steps: found.steps || [], log: found.log || [],
      startedAt: found.startedAt, endedAt: found.endedAt, error: found.error,
    });
    return plan.snapshot();
  }

  // One round of her improving her own harness, from what she has been corrected on.
  async evolve() {
    if (this.evolver) return { ok: false, error: 'a round is already running' };
    this.evolver = new Evolver({
      ask: (req) => this.ask(req),
      judge: (item) => this.judge
        ? this.judge(item)
        : this.ask({ messages: judgeMessages(item), tools: [] }).then((res) => {
          const n = Number(String(res.text).match(/-?\d+(?:\.\d+)?/)?.[0] ?? 0);
          if (!Number.isFinite(n)) return 0;
          return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
        }),
      base: this.base,
      emit: (event) => this.emit({ ...event, kind: 'evolve' }),
      clock: this.clock,
      config: {},
    });
    try {
      return { ok: true, summary: await this.evolver.run() };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      this.evolver = null;
    }
  }

  constitution() {
    return spec.CONSTITUTION;
  }
}

module.exports = { Agent, judgeMessages, guard, spec, store, prompts };
