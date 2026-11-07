'use strict';

// The panel's thinking stream, without a window: her narration, the tools she reaches for, the colour of
// the activity, and the answer bubble being emptied when the narration moves up. A DOM small enough to
// stand in for the real one, the same trick as tests/board.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

function node(tag = 'div') {
  const el = {
    tagName: tag,
    children: [],
    attrs: {},
    listeners: {},
    classList: {
      set: new Set(),
      add(...names) { names.forEach((n) => el.classList.set.add(n)); },
      remove(...names) { names.forEach((n) => el.classList.set.delete(n)); },
      contains(name) { return el.classList.set.has(name); },
      toggle(name, on) { if (on === undefined ? !el.classList.set.has(name) : on) el.classList.set.add(name); else el.classList.set.delete(name); },
    },
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    className: '',
    textContent: '',
    hidden: false,
    value: '',
    disabled: false,
    scrollTop: 0,
    scrollHeight: 100,
    offsetWidth: 320,
    offsetHeight: 200,
    append(...kids) { el.children.push(...kids); },
    appendChild(kid) { el.children.push(kid); return kid; },
    replaceChildren(...kids) { el.children = kids; },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return el.attrs[name] ?? null; },
    addEventListener(name, fn) { (el.listeners[name] ||= []).push(fn); },
    removeEventListener() {},
    focus() {},
    contains() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200 }; },
    querySelector(sel) {
      if (!el.queries) el.queries = new Map();
      if (!el.queries.has(sel)) el.queries.set(sel, node('div'));
      return el.queries.get(sel);
    },
    querySelectorAll() { return []; },
  };
  return el;
}

async function panelWith(t) {
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.document = { createElement: (tag) => node(tag), documentElement: node('html') };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.window = { addEventListener() {} };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => {
    delete globalThis.matchMedia;
    delete globalThis.document;
    delete globalThis.innerWidth;
    delete globalThis.innerHeight;
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });
  const { Panel } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/panel.js')));
  const panelEl = node('aside');
  const tickerEl = node('div');
  const faces = Object.fromEntries(['calm', 'aside', 'smug', 'wide', 'look', 'laugh', 'many', 'grin'].map((n) => [n, n]));
  const panel = new Panel({
    panel: panelEl,
    ticker: tickerEl,
    labels: { state: { chat: 'CHAT', work: 'WORK', done: 'DONE', error: 'ERROR', info: 'INFO' }, action: {} },
    faces,
  });
  return { panel, panelEl };
}

test('her narration and her tools go into the thinking stream, in order', async (t) => {
  const { panel, panelEl } = await panelWith(t);
  panel.current = { chat: true };
  panel.chatTurn({ quote: 'look at my disk', face: 'aside' });
  assert.equal(panel.thoughts.length, 0);
  assert.equal(panel.thoughtsEl.hidden, true);

  panel.think('The disk is full again — figures.');
  panel.act({ verb: 'LISTS', target: 'C:\\Projects', activity: 'read' });

  assert.equal(panel.thoughts.length, 2);
  assert.equal(panel.thoughts[0].kind, 'say');
  assert.equal(panel.thoughts[1].kind, 'act');
  assert.equal(panel.thoughts[1].pending, true);
  assert.equal(panelEl.dataset.activity, 'read'); // the frame takes the colour of the work
  assert.equal(panel.thoughtsEl.hidden, false);
  assert.equal(panel.thoughtsEl.children.length, 2);

  panel.finishAct({ ok: true, ms: 1240 });
  assert.equal(panel.thoughts[1].pending, false);
  assert.equal(panel.thoughts[1].ok, true);
  assert.equal(panel.thoughts[1].ms, 1240);
  assert.equal(panelEl.dataset.activity, 'idle'); // nothing running any more

  // a failure is red, and keeps the entry instead of hiding it
  panel.act({ verb: 'RUNS', target: 'npm test', activity: 'run' });
  panel.finishAct({ ok: false, ms: 800 });
  assert.equal(panelEl.dataset.activity, 'error');
  assert.equal(panel.thoughts.at(-1).ok, false);

  // a new message clears the stream
  panel.current = { chat: true };
  panel.clearThoughts();
  assert.equal(panel.thoughts.length, 0);
  assert.equal(panel.thoughtsEl.hidden, true);
});

test('the old entries are dropped, not scrolled forever', async (t) => {
  const { panel } = await panelWith(t);
  panel.current = { chat: true };
  panel.chatTurn({ quote: 'q', face: 'aside' });
  for (let i = 0; i < 10; i++) panel.think(`thought ${i}`);
  assert.equal(panel.thoughts.length, 8);
  assert.match(panel.thoughts.at(-1).text, /thought 9/);
});

test('emptying the answer when the narration moves up does not close the panel', async (t) => {
  const { panel, panelEl } = await panelWith(t);
  panel.current = { chat: true };
  panel.chatTurn({ quote: 'q', face: 'aside' });
  panel.stream('Let me check that folder');
  panel.clearAnswer();
  assert.equal(panel.line.textContent, '');
  assert.equal(panelEl.hidden, false);
});
