'use strict';

// The tools that grow: a page off the web, one diagnosis call with findings, and the tools the user writes
// in harness/tools.json — parsed, filled in, and run through the same command path as everything else.

const test = require('node:test');
const assert = require('node:assert/strict');

const more = require('../src/main/tools-more');

test('a diagnosis says what is wrong, and what is only worth knowing', () => {
  const bad = more.findings({
    disk: { drive: 'C:', free: 2, total: 100 },
    memory: { used: 92, total: 100 },
    cpu: { load: 97 },
    temperature: { cpu: 95, gpu: { celsius: 90 }, note: null },
    battery: { none: false, percent: 8 },
  });
  assert.equal(bad.filter((f) => f.level === 'bad').length, 2);
  assert.ok(bad.some((f) => /disc C:/.test(f.text)));
  assert.ok(bad.some((f) => /memory/.test(f.text)));
  assert.ok(bad.some((f) => /processor/.test(f.text)));
  assert.ok(bad.some((f) => /gpu/.test(f.text)));
  assert.ok(bad.some((f) => /battery/.test(f.text)));

  const fine = more.findings({
    disk: { drive: 'C:', free: 60, total: 100 },
    memory: { used: 20, total: 100 },
    cpu: { load: 5 },
    temperature: { cpu: 40, gpu: { celsius: 50 }, note: null },
    battery: { none: true },
  });
  assert.deepEqual(fine, []);
});

test('a web page comes back as text, with its title', async () => {
  const html = '<html><head><title>Night City News</title></head><body><h1>Hi</h1><script>bad()</script><p>Body &amp; soul</p></body></html>';
  const fetchImpl = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  const page = await more.webFetch('https://example.com/news', { fetchImpl });
  assert.equal(page.ok, true);
  assert.equal(page.title, 'Night City News');
  assert.match(page.text, /Body & soul/);
  assert.equal(page.text.includes('<'), false);
  assert.equal(page.url, 'https://example.com/news');

  const refused = await more.webFetch('file:///etc/passwd', { fetchImpl });
  assert.match(refused.error, /http/);
});

test('a tool the user wrote is offered, filled in, and run at its level', async () => {
  const calls = [];
  more.attach({
    runCommand: async (command, cwd, ctx) => {
      calls.push({ command, cwd, autonomy: ctx.autonomy });
      return { ok: true, out: 'done' };
    },
    systemInfo: async () => ({ cpu: { load: 1 }, memory: { used: 1, total: 2 } }),
  });
  const added = more.loadCustom([
    {
      name: 'ports',
      description: 'ports',
      autonomy: 'full',
      command: 'powershell -NoProfile -Command "Get-NetTCPConnection | Select-Object -First {count}"',
      parameters: { type: 'object', properties: { count: { type: 'integer' } } },
    },
    { name: 'nope', command: '' }, // no command: dropped
  ]);
  assert.equal(added, 1);
  const names = more.schemas().map((schema) => schema.function.name);
  assert.deepEqual(names, ['ports']);

  const out = await more.run('ports', { count: 3 }, { autonomy: 'guard', root: '.', home: '.' });
  assert.equal(out.tool, 'ports');
  assert.equal(out.out, 'done');
  assert.match(calls[0].command, /First 3/);
  assert.equal(calls[0].autonomy, 'full'); // the tool asked for full, and gets it

  // an unknown name falls through to nothing, so tools.js can say "no such tool"
  assert.equal(await more.run('teleport', {}, {}), null);
  more.loadCustom([]);
});

test('the placeholders are plain text, not a shell of their own', () => {
  assert.equal(more.fillCommand('node {file} --flag {flag}', { file: 'a b.js', flag: 'x' }), 'node a b.js --flag x');
  assert.equal(more.fillCommand('cmd {missing}', {}), 'cmd ');
});
