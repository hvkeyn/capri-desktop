'use strict';

// The commit guard: it has to catch a key or a personal path, and it has to leave placeholders, docs and
// binaries alone. This is a test of the checker, so its own samples are allowed in this file.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const secrets = require('../scripts/check-secrets');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-secrets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('a real key or token in a file is caught, with its line', (t) => {
  const dir = scratch(t);
  const file = path.join(dir, 'config.js');
  fs.writeFileSync(file, [
    'const a = 1;',
    'const key = "sk-abcdefghijklmnopqrstuvwxyz012345";',
    'const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";',
  ].join('\n'));
  const found = secrets.scanFile(file, 'config.js');
  assert.equal(found.length, 2);
  assert.equal(found[0].line, 2);
  assert.match(found[0].why, /API key/);
  assert.equal(found[1].line, 3);
  assert.match(found[1].why, /GitHub token/);
});

test('placeholders, docs and binaries are left alone', (t) => {
  const dir = scratch(t);
  const docs = path.join(dir, 'notes.md');
  fs.writeFileSync(docs, 'DEEPSEEK_API_KEY=sk-… npm run check\n{ openai: \'sk-...\' }');
  assert.deepEqual(secrets.scanFile(docs, 'notes.md'), []);

  const image = path.join(dir, 'shot.png');
  fs.writeFileSync(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.deepEqual(secrets.scanFile(image, 'shot.png'), []);

  const binary = path.join(dir, 'blob.dat');
  fs.writeFileSync(binary, Buffer.from([0x73, 0x6b, 0x2d, 0x00, 0x41]));
  assert.deepEqual(secrets.scanFile(binary, 'blob.dat'), []);
});

test('a personal path is caught, the generic ones are not', (t) => {
  const dir = scratch(t);
  const one = path.join(dir, 'a.js');
  fs.writeFileSync(one, 'const root = "C:\\\\Users\\\\hex\\\\AppData";\n');
  const found = secrets.scanFile(one, 'a.js');
  assert.equal(found.length, 1);
  assert.match(found[0].why, /Windows path/);

  const ok = path.join(dir, 'b.js');
  fs.writeFileSync(ok, 'const a = "C:\\\\Users\\\\me\\\\x"; const b = "C:\\\\Users\\\\Public\\\\Desktop";\n');
  assert.deepEqual(secrets.scanFile(ok, 'b.js'), []);

  const unix = path.join(dir, 'c.js');
  fs.writeFileSync(unix, 'const p = "/home/alice/project";\n');
  assert.equal(secrets.scanFile(unix, 'c.js').length, 1);
});

test('the checker exits non-zero when it finds something, zero when it does not', (t) => {
  const dir = scratch(t);
  const bad = path.join(dir, 'bad.txt');
  fs.writeFileSync(bad, 'token=gho_0123456789abcdefghijklmnopqrstuvwxyz\n');
  const good = path.join(dir, 'good.txt');
  fs.writeFileSync(good, 'nothing to see here\n');
  assert.equal(secrets.main([bad]), 1);
  assert.equal(secrets.main([good]), 0);
});
