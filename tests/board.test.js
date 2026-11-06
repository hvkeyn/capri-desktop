'use strict';

// The board without a browser: a DOM small enough to stand in for a window, and board.js reading a
// snapshot the way the runner writes one. This is the test that catches a board that would throw on
// its first real work order — a missing string, a wrong element — without starting Electron.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The same trick as tests/hooks.test.js: load the browser module in Node, following its imports.
function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

// Just enough element for board.js: children, attributes, classes, a size, and a value on a field.
function node(tag = 'div') {
  const el = {
    tagName: tag,
    children: [],
    attrs: {},
    listeners: {},
    classList: {
      list: new Set(),
      add(...names) { names.forEach((n) => el.classList.list.add(n)); },
      remove(...names) { names.forEach((n) => el.classList.list.delete(n)); },
      contains(name) { return el.classList.list.has(name); },
      toggle(name, on) { if (on === undefined ? !el.classList.list.has(name) : on) el.classList.list.add(name); else el.classList.list.delete(name); },
    },
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    hidden: false,
    disabled: false,
    value: '',
    title: '',
    placeholder: '',
    id: '',
    htmlFor: '',
    type: '',
    maxLength: 0,
    autocomplete: '',
    spellcheck: true,
    offsetHeight: 320,
    append(...kids) { el.children.push(...kids); },
    appendChild(kid) { el.children.push(kid); return kid; },
    replaceChildren(...kids) { el.children = kids; },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return el.attrs[name] ?? null; },
    addEventListener(name, fn) { (el.listeners[name] ||= []).push(fn); },
    removeEventListener() {},
    focus() { el.focused = true; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 320, width: 400, height: 320 }; },
  };
  return el;
}

const fakeOrder = (over = {}) => {
  const now = Date.now();
  return {
    id: '004-tidy-the-nav',
    goal: 'tidy the navigation and make the header sticky',
    workspace: 'C:\\workspace\\site',
    slug: '004-tidy-the-nav',
    phase: 'build',
    phaseTitle: 'Build',
    phases: ['spec', 'plan', 'tasks', 'build', 'report'].map((id) => ({ id, title: id })),
    status: 'running',
    error: null,
    steps: [
      { id: 'T001', title: 'read the header', phase: 'Write', status: 'done', note: 'read it' },
      { id: 'T002', title: 'make the header sticky', phase: 'Write', status: 'running', note: '' },
      { id: 'T003', title: 'run the tests', phase: 'Check', status: 'queued', note: '' },
    ],
    counts: { queued: 1, running: 1, done: 1, failed: 0, skipped: 0 },
    current: { id: 'T002', title: 'make the header sticky' },
    log: [{ at: now, kind: 'file', text: 'PATCHES src/header.css' }, { at: now, kind: 'run', text: 'RUNS npm test' }],
    startedAt: now - 9000,
    endedAt: null,
    elapsedMs: 9000,
    ...over,
  };
};

test('the board draws a work order: five phases, the step she is on, its meter', async (t) => {
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.document = { createElement: (tag) => node(tag) };
  globalThis.innerHeight = 900;
  globalThis.window = { addEventListener() {} };
  t.after(() => {
    delete globalThis.matchMedia;
    delete globalThis.document;
    delete globalThis.innerHeight;
    delete globalThis.window;
  });

  const { Board } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/board.js')));
  const root = node('aside');
  const said = [];
  const tickers = [];
  const acts = [];
  const board = new Board({
    board: root,
    host: { focusOverlay: () => {} },
    capri: { perform: (name, dir) => acts.push([name, dir]) },
    panel: { say: (msg) => said.push(msg), setTicker: (action) => tickers.push(action) },
    lang: () => 'ru',
  });

  board.update(fakeOrder());
  assert.equal(root.hidden, false);
  assert.equal(board.open, true);
  // the five phases of a spec-kit work order, in Russian
  assert.equal(board.stepper.children.length, 5);
  assert.deepEqual(board.stepper.children.map((li) => li.dataset.at), ['done', 'done', 'done', 'now', 'next']);
  // the one loud thing: what she is doing now
  assert.match(board.nowStep.textContent, /T002/);
  assert.match(board.nowStep.textContent, /sticky/);
  assert.equal(board.meterBar.style.transform, 'scaleX(0.333)');
  assert.equal(board.count.textContent, '1/3');
  assert.equal(board.stepsList.children.length, 3);
  assert.equal(board.stepsList.children[1].dataset.status, 'running');
  assert.equal(board.chip.textContent, 'ИДЁТ');
  assert.equal(board.stopBtn.disabled, false);
  // she acts out the phase, and her ticker says what she is doing
  assert.deepEqual(acts.at(-1), ['talk', 0]);
  assert.deepEqual(tickers.at(-1), { verb: 'RUNS', target: 'npm test', error: false });

  // a finished order: the chip says so, Stop goes quiet, and she celebrates once
  board.update(fakeOrder({ status: 'done', phase: 'report', endedAt: Date.now(), elapsedMs: 30000 }));
  assert.equal(board.chip.textContent, 'ГОТОВО');
  assert.equal(board.stopBtn.disabled, true);
  assert.deepEqual(acts.at(-1), ['victory', 0]);
  assert.ok(said.length >= 1, 'she says it is done');

  // a failure is a failure, not a blank board
  board.update(fakeOrder({ status: 'failed', phase: 'build', error: 'T002: npm test failed' }));
  assert.equal(board.chip.textContent, 'СБОЙ');
  assert.deepEqual(acts.at(-1), ['flinch', 0]);

  board.hide();
  clearInterval(board.timer); // the clock the board keeps while it's open
});

test('the order form takes a sentence and a folder, and hands them on', async (t) => {
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.document = { createElement: (tag) => node(tag) };
  globalThis.innerHeight = 900;
  globalThis.window = { addEventListener() {} };
  t.after(() => {
    delete globalThis.matchMedia;
    delete globalThis.document;
    delete globalThis.innerHeight;
    delete globalThis.window;
  });

  const { Board } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/board.js')));
  const root = node('aside');
  const handed = [];
  const board = new Board({ board: root, host: { focusOverlay: () => {} }, capri: {}, panel: {}, lang: () => 'en' });
  board.onStart = (goal, workspace) => handed.push({ goal, workspace });
  board.showOrder('C:\\workspace\\site');
  assert.equal(board.goalInput.focused, true);
  board.goalInput.value = '  make the header sticky  ';
  board.submit();
  assert.deepEqual(handed, [{ goal: 'make the header sticky', workspace: 'C:\\workspace\\site' }]);
  assert.equal(board.goalInput.value, '');
  clearInterval(board.timer);
});
