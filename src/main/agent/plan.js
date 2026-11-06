'use strict';

// The board's model: where a work order is, in five phases and a list of steps, and what she has just
// done. The overlay draws nothing but a snapshot of this, and the runner is the only thing that writes
// to it, so what you watch is what actually happened.

const PHASES = ['spec', 'plan', 'tasks', 'build', 'report'];

const PHASE_TITLE = {
  spec: 'Spec', plan: 'Plan', tasks: 'Tasks', build: 'Build', report: 'Report',
};

const STATUS = { queued: 'queued', running: 'running', done: 'done', failed: 'failed', skipped: 'skipped' };

const MAX_LOG = 40;

class Plan {
  constructor({ id, goal, workspace = '', slug = '' }) {
    this.id = id || '';
    this.goal = String(goal || '');
    this.workspace = workspace;
    this.slug = slug;
    this.phase = 'spec';
    this.status = 'running'; // running | done | failed | stopped
    this.steps = [];
    this.log = [];
    this.attachments = []; // what was handed to her: { name, kind, bytes }
    this.summary = '';     // the paragraph she tells you at the end, when the order is over
    this.startedAt = Date.now();
    this.endedAt = null;
    this.error = null;
  }

  get elapsedMs() {
    return (this.endedAt || Date.now()) - this.startedAt;
  }

  get current() {
    return this.steps.find((s) => s.status === STATUS.running) || null;
  }

  // One line in the board's log, the kind deciding its colour: 'tool', 'file', 'run', 'note', 'error'.
  note(text, kind = 'note') {
    const line = String(text || '').replace(/\s+/g, ' ').trim();
    if (!line) return this;
    this.log.push({ at: Date.now(), kind, text: line.slice(0, 220) });
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    return this;
  }

  setPhase(phase) {
    if (PHASES.includes(phase)) this.phase = phase;
    return this;
  }

  // What you gave her with the work order, as the board shows it: a chip each, and no content (the
  // content is in the prompt and in the folder, not in a state file the overlay keeps around).
  give(attachments = []) {
    this.attachments = attachments.map((a) => ({
      name: String(a.name || ''),
      kind: a.kind || 'text',
      bytes: Number(a.bytes) || 0,
    }));
    return this;
  }

  // The steps of the build, from tasks.md: they arrive together, all of them queued, so the board can
  // show what is still ahead of her instead of one unknown step at a time.
  addSteps(steps) {
    for (const step of steps || []) {
      if (!step?.id || this.steps.some((s) => s.id === step.id)) continue;
      this.steps.push({
        id: step.id,
        title: String(step.title || '').slice(0, 160),
        phase: step.phase || 'Build',
        status: STATUS.queued,
        note: '',
        startedAt: null,
        endedAt: null,
      });
    }
    return this;
  }

  step(id) {
    return this.steps.find((s) => s.id === id) || null;
  }

  start(id) {
    const step = this.step(id);
    if (!step) return this;
    step.status = STATUS.running;
    step.startedAt = Date.now();
    step.endedAt = null;
    return this;
  }

  finish(id, note = '') {
    const step = this.step(id);
    if (!step) return this;
    step.status = STATUS.done;
    step.endedAt = Date.now();
    if (note) step.note = String(note).slice(0, 200);
    return this;
  }

  fail(id, reason = '') {
    const step = this.step(id);
    if (!step) return this;
    step.status = STATUS.failed;
    step.endedAt = Date.now();
    step.note = String(reason || '').slice(0, 200);
    return this;
  }

  // A step that was skipped because something before it failed: it stays on the board, greyed, rather
  // than vanishing and leaving the count wrong.
  skip(id, reason = '') {
    const step = this.step(id);
    if (!step || step.status === STATUS.done) return this;
    step.status = STATUS.skipped;
    step.note = String(reason || '').slice(0, 200);
    return this;
  }

  done() {
    this.status = 'done';
    this.phase = 'report';
    this.endedAt = Date.now();
    return this;
  }

  halt(reason, status = 'failed') {
    this.status = status;
    this.endedAt = Date.now();
    if (reason) {
      this.error = String(reason).slice(0, 300);
      this.note(reason, 'error');
    }
    return this;
  }

  // What the overlay draws, and what state.json keeps.
  snapshot() {
    const counts = { queued: 0, running: 0, done: 0, failed: 0, skipped: 0 };
    for (const s of this.steps) counts[s.status] = (counts[s.status] || 0) + 1;
    const current = this.current;
    return {
      id: this.id,
      goal: this.goal,
      workspace: this.workspace,
      slug: this.slug,
      phase: this.phase,
      phaseTitle: PHASE_TITLE[this.phase] || this.phase,
      phases: PHASES.map((p) => ({ id: p, title: PHASE_TITLE[p] })),
      status: this.status,
      error: this.error,
      steps: this.steps.map((s) => ({ ...s })),
      counts,
      attachments: this.attachments.map((a) => ({ ...a })),
      summary: this.summary,
      current: current ? { id: current.id, title: current.title } : null,
      log: this.log.slice(-12),
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      elapsedMs: this.elapsedMs,
    };
  }
}

module.exports = { Plan, PHASES, PHASE_TITLE, STATUS };
