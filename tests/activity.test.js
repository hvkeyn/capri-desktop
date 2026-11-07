'use strict';

// What the panel says a tool is doing: the verb, the thing it touches, and the colour/face that go with
// it. A pure mapping, so it is tested here rather than by looking at a window.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

test('every tool of her chat has a verb, a target and an activity', async () => {
  const { describe } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/activity.js')));

  assert.deepEqual(describe('list_dir', { path: 'C:\\Projects' }), { verb: 'LISTS', target: 'C:\\Projects', activity: 'read' });
  assert.deepEqual(describe('read_file', { path: 'a/b.js' }), { verb: 'READS', target: 'a/b.js', activity: 'read' });
  assert.deepEqual(describe('run_command', { command: 'npm test' }), { verb: 'RUNS', target: 'npm test', activity: 'run' });
  assert.deepEqual(describe('search_files', { pattern: 'nova' }), { verb: 'GREPS', target: 'nova', activity: 'search' });
  assert.deepEqual(describe('launch_folder', {}), { verb: 'LOCATES', target: 'her own folder', activity: 'think' });

  // an unknown tool still says something true, and a long target is cut rather than wrapping the panel
  const unknown = describe('teleport', {});
  assert.equal(unknown.verb, 'USES');
  assert.equal(unknown.activity, 'think');
  const long = describe('run_command', { command: 'x'.repeat(200) });
  assert.ok(long.target.length <= 48);
  assert.ok(long.target.endsWith('…'));

  // a tool called with nothing doesn't throw
  assert.equal(typeof describe('read_file').target, 'string');
});

test('waiting has its own line, so the first second is not an empty panel', async () => {
  const { WAITING } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/activity.js')));
  assert.equal(WAITING.think.activity, 'wait');
  assert.ok(WAITING.think.verb);
});
