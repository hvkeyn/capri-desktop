'use strict';

// The same line twice in a row is what makes a character sound broken. pick() now draws from a shuffled bag
// per list: every line is used once before any comes back, and the bag never opens with the line just said.

// util.js reads the system's reduced-motion preference at load; in Node it gets a quiet stub
globalThis.matchMedia = globalThis.matchMedia || ((query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

const load = () => import(moduleUrl(path.join(__dirname, '../src/renderer/js/util.js')));

test('a small pool is used up before anything repeats', async () => {
  const { pick } = await load();
  const pool = ['a', 'b', 'c', 'd'];
  const seen = [];
  for (let i = 0; i < 40; i++) seen.push(pick(pool));
  for (let start = 0; start < 40; start += pool.length) {
    const block = seen.slice(start, start + pool.length).sort();
    assert.deepEqual(block, [...pool].sort());
  }
});

test('the last line said is not the first of the next bag', async () => {
  const { pick } = await load();
  const pool = ['a', 'b', 'c'];
  const seen = [];
  for (let i = 0; i < 60; i++) seen.push(pick(pool));
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `repeat at ${i}`);
});

test('a list of one and an empty list are handled', async () => {
  const { pick } = await load();
  assert.equal(pick(['only']), 'only');
  assert.equal(pick([]), undefined);
  assert.equal(pick(undefined), undefined);
});
