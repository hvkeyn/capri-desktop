'use strict';

// The harness without Electron: the guard, the folder tools, the spec-kit paperwork, the runner's
// phases with a scripted model, and the rules a round of self-editing has to clear.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const guard = require('../src/main/agent/guard');
const fsx = require('../src/main/agent/fsx');
const spec = require('../src/main/agent/spec');
const { Runner } = require('../src/main/agent/runner');
const store = require('../src/main/agent/store');
const evolve = require('../src/main/agent/evolve');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-agent-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// ---- the guard ---------------------------------------------------------------------------------

test('the guard keeps files inside the folder of the work order', (t) => {
  const root = scratch(t);
  assert.equal(guard.within(root, path.join(root, 'src', 'a.js')), true);
  assert.equal(guard.within(root, path.join(root, '..', 'elsewhere')), false);
  assert.equal(guard.resolve(root, 'src/a.js').ok, true);
  assert.equal(guard.resolve(root, '../outside.txt').ok, false);
  assert.equal(guard.resolve(root, 'C:\\Windows\\system32\\drivers\\etc\\hosts').ok, false);
});

test('a command is argv, never a shell', () => {
  assert.deepEqual(guard.parseCommand('npm test -- --runInBand').argv, ['npm', 'test', '--', '--runInBand']);
  assert.deepEqual(guard.parseCommand('git commit -m "a message with spaces"').argv, ['git', 'commit', '-m', 'a message with spaces']);
  assert.equal(guard.parseCommand('echo "unbalanced').ok, false);
  assert.deepEqual(guard.parseCommand('node -e "a && b"').argv, ['node', '-e', 'a && b']);
});

test('guard mode allows a project tools, refuses a shell and the destructive ones', () => {
  assert.equal(guard.checkCommand('npm test').ok, true);
  assert.equal(guard.checkCommand('python -m pytest').ok, true);
  const ps = guard.checkCommand('powershell -Command "Remove-Item C:\\ -Recurse"');
  assert.equal(ps.ok, false);
  assert.match(ps.reason, /never run/);
  const cmd = guard.checkCommand('cmd /c del /s /q C:\\');
  assert.equal(cmd.ok, false);
  const disk = guard.checkCommand('format C:');
  assert.equal(disk.ok, false);
  // trusted is wider, but the same hard refusals stand
  assert.equal(guard.checkCommand('npm test', { autonomy: 'trusted' }).ok, true);
  assert.equal(guard.checkCommand('format C:', { autonomy: 'trusted' }).ok, false);
});

// ---- the folder ---------------------------------------------------------------------------------

test('files are read, written, patched and searched, and nothing escapes', (t) => {
  const root = scratch(t);
  assert.equal(fsx.write(root, 'notes/a.txt', 'hello world\nsecond line\n').ok, true);
  const read = fsx.read(root, 'notes/a.txt');
  assert.equal(read.ok, true);
  assert.match(read.text, /hello world/);

  assert.equal(fsx.patch(root, 'notes/a.txt', 'second line', 'third line').ok, true);
  assert.match(fsx.read(root, 'notes/a.txt').text, /third line/);
  // a patch that finds nothing, or finds it twice, is refused rather than guessed at
  assert.equal(fsx.patch(root, 'notes/a.txt', 'nowhere', 'x').ok, false);
  fsx.write(root, 'twice.txt', 'same\nsame\n');
  assert.equal(fsx.patch(root, 'twice.txt', 'same', 'other').ok, false);

  const list = fsx.list(root, 'notes');
  assert.deepEqual(list.entries.map((e) => e.name), ['a.txt']);

  const hits = fsx.search(root, 'third');
  assert.equal(hits.hits.length, 1);
  assert.equal(hits.hits[0].file, 'notes/a.txt');

  assert.equal(fsx.write(root, '../escape.txt', 'no').ok, false);
  assert.equal(fs.existsSync(path.join(root, '..', 'escape.txt')), false);
});

// ---- the paperwork ------------------------------------------------------------------------------

test('spec-kit artifacts: numbering, a slug from Russian, and a tasks.md that parses', (t) => {
  const root = scratch(t);
  assert.equal(spec.slug('Поправь шапку сайта'), 'poprav-shapku-sayta');
  const first = spec.feature(root, 'Add a login form');
  assert.equal(first.id, '001-add-a-login-form');
  const second = spec.feature(root, 'Add a login form');
  assert.equal(second.id, '002-add-a-login-form');

  const tasks = spec.parseTasks([
    '## Phase 1: Setup',
    '- [ ] T001 read the project',
    '- [ ] T002 [P] add the route',
    '## Phase 2: Check',
    '- [x] T003 run the tests',
  ].join('\n'));
  assert.equal(tasks.tasks.length, 3);
  assert.equal(tasks.tasks[1].parallel, true);
  assert.equal(tasks.tasks[2].done, true);
  assert.deepEqual(tasks.phases, ['Setup', 'Check']);

  // ticking one leaves the rest alone
  const dir = first.dir;
  spec.write(dir, 'tasks.md', '- [ ] T001 one\n- [ ] T002 two\n');
  spec.tick(dir, 'T002');
  assert.match(fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8'), /- \[x\] T002/);
  assert.match(fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8'), /- \[ \] T001/);
});

// ---- the runner ---------------------------------------------------------------------------------

// A model that answers the three writing phases, then works T001 and T002 with real tool calls.
function scripted(runs) {
  return async ({ messages, tools }) => {
    const last = String(messages[messages.length - 1].content || '');
    runs.push({ last, tools: tools?.length || 0 });
    if (/Write `spec\.md`/.test(last)) return { text: '## Goal\nmake a file\n## Acceptance\n- hello.txt exists\n' };
    if (/Write `plan\.md`/.test(last)) return { text: '## Approach\nwrite one file\n## Files\nhello.txt\n' };
    if (/Write `tasks\.md`/.test(last)) {
      return { text: '## Phase 1: Write\n- [ ] T001 write hello.txt\n## Phase 2: Check\n- [ ] T002 read it back\n' };
    }
    if (/Write `report\.md`/.test(last)) return { text: '## Done\n- T001\n## Checked\nread back\n---\nall done.' };
    if (/T001/.test(last)) {
      return {
        text: '',
        toolCalls: [
          { id: 'c1', name: 'write_file', arguments: JSON.stringify({ path: 'hello.txt', content: 'hi\n' }) },
          { id: 'c2', name: 'update_plan', arguments: JSON.stringify({ status: 'done', note: 'wrote it' }) },
        ],
      };
    }
    if (/T002/.test(last)) {
      return {
        text: 'checked',
        toolCalls: [
          { id: 'c3', name: 'read_file', arguments: JSON.stringify({ path: 'hello.txt' }) },
          { id: 'c4', name: 'update_plan', arguments: JSON.stringify({ status: 'done', note: 'read back' }) },
        ],
      };
    }
    return { text: 'ok' };
  };
}

test('a work order writes spec, plan and tasks, then builds them one by one', async (t) => {
  const root = scratch(t);
  const runs = [];
  const states = [];
  const runner = new Runner({
    ask: scripted(runs),
    store: { savePlan: () => {}, observe: () => {} },
    emit: (state) => states.push(state),
    autonomy: 'guard',
  });
  const first = runner.start({ goal: 'make a file', workspace: root });
  assert.equal(first.status, 'running');
  const done = await runner.completion;
  assert.equal(done.status, 'done');
  assert.equal(done.steps.length, 2);
  assert.ok(done.steps.every((s) => s.status === 'done'));
  assert.equal(fs.readFileSync(path.join(root, 'hello.txt'), 'utf8'), 'hi\n');

  const dir = path.join(root, 'specs', '001-make-a-file');
  for (const file of ['spec.md', 'plan.md', 'tasks.md', 'report.md', 'state.json']) {
    assert.ok(fs.existsSync(path.join(dir, file)), `${file} was written`);
  }
  assert.match(fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8'), /- \[x\] T001/);
  // the board saw the phases it went through, and the last state it saw is the finished one
  assert.ok(states.some((s) => s.phase === 'spec'));
  assert.ok(states.some((s) => s.phase === 'build'));
  assert.equal(states.at(-1).phase, 'report');
  // the first writing phase is asked without tools, the build with them
  assert.equal(runs[0].tools, 0);
  assert.ok(runs.some((r) => r.tools > 0));
});

test('a stopped work order leaves the board saying so, not hanging', async (t) => {  const root = scratch(t);
  const runner = new Runner({
    ask: async () => new Promise((resolve) => setTimeout(() => resolve({ text: '# spec' }), 40)),
    store: { savePlan: () => {}, observe: () => {} },
    emit: () => {},
  });
  runner.start({ goal: 'never finishes', workspace: root });
  setTimeout(() => runner.stop(), 10);
  const done = await runner.completion;
  assert.equal(done.status, 'stopped');
  assert.equal(done.phase, 'spec');
});

// ---- her own harness ----------------------------------------------------------------------------

test('the edit budget anneals from four edits to one', () => {
  const cfg = { rounds: 6, maxEdits: 4 };
  assert.equal(evolve.editBudget(0, cfg), 4);
  assert.equal(evolve.editBudget(2, cfg), 3);
  assert.equal(evolve.editBudget(5, cfg), 1);
  assert.equal(evolve.editBudget(99, cfg), 1);
});

test('the critic refuses what would overfit or reach outside the harness', () => {
  const files = { 'persona.md': 'Be brief and never apologise twice.', 'work.md': 'Read first.' };
  const cases = [{ input: 'how do I centre a div', better: 'just use grid, not absolute positioning' }];
  const good = { component: 'persona', file: 'persona.md', hypothesis: 'shorter answers are read more', find: 'Be brief', replace: 'Be brief, in one sentence' };
  assert.equal(evolve.screen([good], { files, budget: 2, cases }).ok.length, 1);

  const outside = evolve.screen([{ ...good, file: 'src/main/main.js' }], { files, budget: 2, cases });
  assert.equal(outside.ok.length, 0);
  assert.match(outside.problems[0], /not a file of the harness/);

  const copied = evolve.screen([
    { ...good, find: 'Be brief', replace: 'When asked to centre a div just use grid not absolute positioning' },
  ], { files, budget: 2, cases });
  assert.equal(copied.ok.length, 0);
  assert.match(copied.problems.join(' '), /copies the words/);

  const tooMany = evolve.screen([good, { ...good, hypothesis: 'another one' }], { files, budget: 1, cases });
  assert.match(tooMany.problems.join(' '), /budget is 1/);
});

test('a round accepts only a gain that clears the floor, and keeps a backup', async (t) => {
  const base = scratch(t);
  store.ensure(base, { 'persona.md': 'Be brief.\n', 'work.md': 'Read first.\n' });
  store.observe(base, { kind: 'correction', text: 'be shorter, one line', meta: { input: 'how do I centre a div' } });

  const proposal = JSON.stringify({
    hypothesis: 'brevity is the habit that is missing',
    edits: [{ component: 'persona', file: 'persona.md', hypothesis: 'one line answers', find: 'Be brief.', replace: 'Be brief. STRICT: one line.' }],
  });
  const ask = async () => ({ text: proposal });
  const answer = async (files) => (files['persona.md'].includes('STRICT') ? 'one line' : 'a long answer with everything in it');
  const judge = async ({ output }) => (output === 'one line' ? 1 : 0);

  const evolver = new evolve.Evolver({ ask, judge, answer, base, config: { minGain: 0.04 } });
  const summary = await evolver.run();
  assert.equal(summary.accepted, true);
  assert.ok(summary.delta > 0.9);
  assert.match(store.harness(base)['persona.md'], /STRICT/);
  const backupDirs = fs.readdirSync(path.join(base, 'evolution', 'backups'));
  assert.ok(backupDirs.length >= 1);
  assert.match(fs.readFileSync(path.join(base, 'evolution', 'backups', backupDirs[0], 'persona.md'), 'utf8'), /^Be brief\.$/m);

  // a second round with the same, now-useless edit gains nothing: the floor keeps it out
  store.writeHarness(base, 'persona.md', 'Be brief. STRICT: one line.\n');
  store.observe(base, { kind: 'correction', text: 'be shorter, one line', meta: { input: 'how do I centre a div' } });
  const flat = await new evolve.Evolver({ ask, judge: async () => 1, answer, base }).run();
  assert.equal(flat.accepted, false);
  assert.match(flat.reason, /noise floor|does not pay/);
});

test('a component that keeps failing is pruned out of the search', (t) => {
  const base = scratch(t);
  store.ensure(base, { 'persona.md': 'x', 'work.md': 'y' });
  for (let i = 0; i < 3; i++) {
    store.appendHistory(base, { at: '2026-01-01T00:00:00Z', verdict: 'rejected', component: 'skills', hypothesis: `try ${i}` });
  }
  const pruned = evolve.prune(base, { pruned: [] });
  assert.deepEqual(pruned, ['skills']);
  // one acceptance resets the streak
  store.appendHistory(base, { at: '2026-01-01T00:00:00Z', verdict: 'accepted', component: 'skills', hypothesis: 'it worked' });
  assert.deepEqual(evolve.prune(base, { pruned: [] }), []);
});

// ---- the object main.js talks to ----------------------------------------------------------------

test('the agent seeds her harness, hears a correction, and runs a work order to the end', async (t) => {
  const { Agent } = require('../src/main/agent');
  const base = scratch(t);
  const folder = scratch(t);
  const events = [];
  const agent = new Agent({ base, ask: scripted([]), emit: (state) => events.push(state), autonomy: () => 'guard' }).ensure();

  // the harness in /harness was copied into her storage, and its standing notes reach her chat
  assert.ok(fs.existsSync(path.join(base, 'harness', 'persona.md')));
  assert.match(agent.personaNote(), /Standing notes/);

  // a message that starts by telling her she got it wrong is a case for evolve.js, not just a message
  agent.observeChat({ message: 'нет, не так — короче', previous: 'how do I centre a div' });
  agent.observeChat({ message: 'how do I centre a div' });
  const seen = store.observations(base);
  assert.equal(seen[0].kind, 'correction');
  assert.equal(seen[0].meta.input, 'how do I centre a div');
  assert.equal(seen[1].kind, 'message');

  const started = agent.startWork({ goal: 'make a file', workspace: folder });
  assert.equal(started.ok, true);
  assert.equal(started.plan.phase, 'spec');
  // a second order may not start while the first is running
  assert.equal(agent.startWork({ goal: 'another', workspace: folder }).ok, false);
  const done = await agent.runner.completion;
  assert.equal(done.status, 'done');
  assert.ok(events.some((state) => state.status === 'done'));
  // the board survives a restart: the last plan is on disk
  assert.equal(agent.lastPlan().goal, 'make a file');
  assert.equal(agent.lastPlan().steps.length, 2);

  // the next one can start, and stopping it says stopped
  const again = agent.startWork({ goal: 'another one', workspace: folder });
  assert.equal(again.ok, true);
  agent.stopWork();
  assert.equal((await agent.runner.completion).status, 'stopped');
});
