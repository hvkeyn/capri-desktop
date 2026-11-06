'use strict';

// Her harness, improved by herself — carefully.
//
// The idea is the one in RRSI (arxiv 2609.24972, google-research/rrsi): an agent's behaviour is set by
// the words and files around a frozen model, so you can improve the agent by editing those files. But a
// loop that only ever asks "did the score go up on the things I have seen?" memorises the things it has
// seen. So the search is regularised instead of the edit space being closed:
//
//   proposal side — an annealed budget (a candidate may bundle fewer and fewer edits as rounds go by),
//                   the proposer is shown the whole edit history so a falsified idea isn't redrawn, and
//                   a stalled run is pointed at a component it has never touched;
//   selection side — a critic screens every candidate before it is scored (no user's words copied in,
//                   no leaking of the very cases it will be scored on), a gain has to clear a noise
//                   floor to count at all, a gain has to be worth the extra tokens it costs, and a
//                   component that keeps failing is pruned out of the search.
//
// What it may edit is `harness/` and nothing else: her standing notes, how she works a work order, and
// the checklists under skills/. Not the app, not your files. Every accepted round is backed up first,
// and the history is a JSONL you can read.

const store = require('./store');

const COMPONENTS = { persona: 'persona.md', work: 'work.md', skills: 'skills/' };

const DEFAULTS = {
  rounds: 6,            // T: how many rounds a full evolution is (the budget anneals over it)
  maxEdits: 4,          // b_0: edits one candidate may bundle in round 0
  minGain: 0.04,        // delta: a gain below this is noise
  costWeight: 0.02,     // a gain has to be at least this per 1k extra tokens
  maxCases: 6,          // replay cases per round: each one is a model call
  pruneAfter: 3,        // a component that failed this many times in a row is left alone
  maxEditChars: 1200,
  minHypothesis: 12,
};

// b_t: the annealed budget. Four edits may be bundled at the start of a run, one by the end: as the
// harness gets better, a big bundle is more likely to be a lucky mess than a real mechanism.
const editBudget = (round, { rounds, maxEdits }) => {
  const t = Math.max(0, Math.min(round, rounds - 1));
  return Math.max(1, Math.ceil(maxEdits * (1 - t / Math.max(1, rounds))));
};

// The cases she is scored on: the moments you corrected her. Not your whole chat, and never sent back
// to a server as a prompt until the round actually runs.
function cases(observations, limit) {
  const out = [];
  for (const row of observations || []) {
    if (row.kind !== 'correction' || !row.meta?.input) continue;
    out.push({ input: String(row.meta.input).slice(0, 600), better: String(row.text || '').slice(0, 600) });
  }
  return out.slice(-limit);
}

// Twelve words copied straight out of a case would pass any test about that case and teach nothing.
const shingles = (text) => {
  const words = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 5 <= words.length; i++) out.add(words.slice(i, i + 5).join(' '));
  return out;
};

const LEAK = [
  /https?:\/\//i,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /\b(sk|pk|ghp|gho)-[a-z0-9]{10,}/i,
  /\bT\d{3,4}\b/,                       // the task ids of the very work order being judged
  /\b(case|test|benchmark)\s*#?\d\b/i,  // "case 3 says…"
];

function screen(edits, { files, budget, cases: replay }) {
  const problems = [];
  const ok = [];
  if (!Array.isArray(edits)) return { ok, problems: ['the proposer gave no edits'] };
  // the budget is a cap on the candidate, not a filter: a candidate that bundles more than the round
  // allows is refused whole, so a big bundle can never win by being cut down after the fact
  if (edits.length > budget) return { ok, problems: [`${edits.length} edits in one candidate, the budget is ${budget}`] };
  const caseText = (replay || []).map((c) => shingles(`${c.input} ${c.better}`));
  for (const [i, edit] of edits.slice(0, budget).entries()) {
    const at = `edit ${i + 1}`;
    if (!edit || typeof edit !== 'object') { problems.push(`${at}: not an object`); continue; }
    const file = String(edit.file || '');
    const target = files[file];
    if (!target) { problems.push(`${at}: "${file}" is not a file of the harness`); continue; }
    if (typeof edit.hypothesis !== 'string' || edit.hypothesis.trim().length < 12) { problems.push(`${at}: no hypothesis to test`); continue; }
    const find = String(edit.find ?? '');
    const replace = String(edit.replace ?? '');
    if (!find) { problems.push(`${at}: nothing to find in ${file}`); continue; }
    const first = target.indexOf(find);
    if (first < 0) { problems.push(`${at}: that text is not in ${file}`); continue; }
    if (target.indexOf(find, first + find.length) >= 0) { problems.push(`${at}: that text is in ${file} more than once`); continue; }
    if (replace.length > DEFAULTS.maxEditChars) { problems.push(`${at}: ${replace.length} characters is too much to add at once`); continue; }
    if (LEAK.some((re) => re.test(replace))) { problems.push(`${at}: the change carries something it shouldn't (a link, an address, a key, a task id)`); continue; }
    const words = shingles(replace);
    if (caseText.some((set) => [...words].some((w) => set.has(w)))) { problems.push(`${at}: the change copies the words of a case it will be scored on`); continue; }
    ok.push({ component: edit.component || componentOf(file), file, hypothesis: edit.hypothesis.trim(), find, replace });
  }
  return { ok, problems };
}

function componentOf(file) {
  if (file === 'persona.md') return 'persona';
  if (file === 'work.md') return 'work';
  if (file.startsWith('skills/')) return 'skills';
  return 'other';
}

function applyEdits(files, edits) {
  const next = { ...files };
  for (const edit of edits) next[edit.file] = next[edit.file].replace(edit.find, edit.replace);
  return next;
}

// What she is answering with, for one case, under a given harness: her standing notes, then the ask.
function prompt(files, input) {
  return [
    { role: 'system', content: `You are Capri. ${String(files['persona.md'] || '').trim()}\n\n${String(files['work.md'] || '').trim()}` },
    { role: 'user', content: String(input) },
  ];
}

// The JSON a proposer is asked for, pulled out of whatever it wrapped it in.
function parseProposal(text) {
  const source = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function historyNote(history, pruned) {
  if (!history.length) return 'No edits have been tried yet.';
  const lines = history.slice(-8).map((h) => `- ${h.verdict}: ${h.component} — ${h.hypothesis}${h.reason ? ` (${h.reason})` : ''}`);
  const prunedNote = pruned.length ? `\nLeave these alone, they have failed enough: ${pruned.join(', ')}.` : '';
  return `What has already been tried:\n${lines.join('\n')}${prunedNote}`;
}

class Evolver {
  constructor({ ask, judge, base, emit = () => {}, answer = null, clock = () => Date.now(), config = {} }) {
    this.ask = ask;
    this.judge = judge;
    this.base = base;
    this.emit = emit;
    this.clock = clock;
    this.cfg = { ...DEFAULTS, ...config };
    this.answer = answer || (async (files, input) => {
      const res = await this.ask({ messages: prompt(files, input), tools: [] });
      return String(res.text || '');
    });
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
  }

  async run() {
    const state = store.evolutionState(this.base);
    const history = store.history(this.base);
    const round = Number(state.rounds) || 0;
    const budget = editBudget(round, this.cfg);
    const files = store.harness(this.base);
    const replay = cases(store.observations(this.base, 400), this.cfg.maxCases);
    const summary = {
      round, budget, cases: replay.length, proposal: null, screened: [], accepted: false,
      score: null, incumbent: null, delta: null, reason: null, cost: 0, pruned: state.pruned || [],
    };
    this.emit({ type: 'evolve', stage: 'start', ...summary });

    if (!replay.length) {
      summary.reason = 'nothing to learn from yet: no correction of yours is on record';
      return this.close(summary, state);
    }

    // 1. propose
    const proposal = parseProposal(await this.tell([
      { role: 'system', content: 'You improve an agent harness by editing its Markdown files. You are careful, and you propose one hypothesis at a time.' },
      {
        role: 'user',
        content: [
          `The harness files you may edit: ${Object.keys(files).join(', ')}.`,
          Object.entries(files).map(([name, text]) => `### ${name}\n${text.slice(0, 4000)}`).join('\n\n'),
          historyNote(history, state.pruned || []),
          `You may bundle at most ${budget} edit(s) this round.`,
          'The cases she is measured on are moments where the person corrected her. Propose edits that would make her need that correction less often — general habits, not answers to those particular moments.',
          'Answer with JSON only: {"hypothesis": "…", "edits": [{"component": "persona|work|skills", "file": "persona.md", "hypothesis": "…", "find": "exact text from the file", "replace": "what it becomes"}]}',
        ].join('\n\n'),
      },
    ]));
    summary.proposal = proposal?.hypothesis || null;
    this.emit({ type: 'evolve', stage: 'proposed', ...summary });

    // 2. the critic, before anything is evaluated
    const screened = screen(proposal?.edits, { files, budget, cases: replay });
    summary.screened = screened.problems;
    if (!screened.ok.length) {
      summary.reason = screened.problems[0] || 'nothing to evaluate';
      this.record({ verdict: 'screened', component: 'unknown', hypothesis: summary.proposal || '', reason: summary.reason, round, budget });
      return this.close(summary, state);
    }

    // 3. evaluate: the harness as it is, then the harness with the edits, on the same cases
    const candidate = applyEdits(files, screened.ok);
    const base = await this.score(files, replay);
    const next = await this.score(candidate, replay);
    summary.incumbent = base.score;
    summary.score = next.score;
    summary.delta = Number((next.score - base.score).toFixed(4));
    summary.cost = next.tokens;

    // 4. selection: clear the floor, and pay for itself
    const gain = summary.delta;
    const paid = gain >= this.cfg.minGain;
    const worth = gain >= this.cfg.costWeight * (next.tokens / 1000);
    if (!paid || !worth) {
      summary.reason = !paid ? `a gain of ${gain.toFixed(3)} is inside the noise floor (${this.cfg.minGain})`
        : `a gain of ${gain.toFixed(3)} does not pay for ${next.tokens} tokens`;
      for (const edit of screened.ok) this.record({ verdict: 'rejected', ...edit, score: gain, round, budget, reason: summary.reason });
      return this.close(summary, state);
    }

    // 5. keep it: backed up first, then written, then recorded
    store.backup(this.base, `r${round}-${this.clock()}`);
    for (const edit of screened.ok) {
      store.writeHarness(this.base, edit.file, candidate[edit.file]);
      this.record({ verdict: 'accepted', ...edit, score: gain, round, budget, reason: null });
    }
    summary.accepted = true;
    state.accepted = (state.accepted || 0) + 1;
    return this.close(summary, state);
  }

  // One harness, on the replay cases: mean judge score, and the tokens it took to get it.
  async score(files, replay) {
    let total = 0;
    let tokens = 0;
    for (const item of replay) {
      if (this.stopped) break;
      let output = '';
      try {
        output = await this.answer(files, item.input);
      } catch {
        output = '';
      }
      tokens += Math.ceil((String(item.input).length + output.length) / 4);
      let verdict = 0;
      try {
        verdict = Number(await this.judge({ input: item.input, output, better: item.better }));
      } catch {
        verdict = 0;
      }
      total += Number.isFinite(verdict) ? Math.max(0, Math.min(1, verdict)) : 0;
    }
    return { score: replay.length ? total / replay.length : 0, tokens };
  }

  async tell(messages) {
    const res = await this.ask({ messages, tools: [] });
    const text = String(res.text || '');
    if (this.cfg.onText) this.cfg.onText(text);
    return text;
  }

  record(entry) {
    store.appendHistory(this.base, { at: new Date(this.clock()).toISOString(), ...entry });
    this.emit({ type: 'evolve', stage: 'record', ...entry });
  }

  close(summary, state) {
    const pruned = prune(this.base, state);
    state.rounds = (Number(state.rounds) || 0) + 1;
    state.pruned = pruned;
    state.lastAt = new Date(this.clock()).toISOString();
    if (!summary.accepted && summary.score !== null) state.rejected = (state.rejected || 0) + 1;
    store.saveEvolutionState(this.base, state);
    const out = { ...summary, pruned, round: state.rounds };
    this.emit({ type: 'evolve', stage: 'done', ...out });
    return out;
  }
}

// A component that has failed `pruneAfter` times in a row is dropped from the search: the proposer is
// told to leave it alone, and the next rounds spend their budget on the ones that still move.
function prune(base, state) {
  const history = store.history(base);
  const streak = new Map();
  for (const row of history) {
    if (!row.component || row.component === 'unknown') continue;
    if (row.verdict === 'accepted') streak.set(row.component, 0);
    else streak.set(row.component, (streak.get(row.component) || 0) + 1);
  }
  const pruned = new Set(state.pruned || []);
  for (const [component, count] of streak) {
    if (count >= DEFAULTS.pruneAfter) pruned.add(component);
  }
  return [...pruned];
}

module.exports = { Evolver, editBudget, screen, parseProposal, cases, applyEdits, prune, COMPONENTS, DEFAULTS };
