'use strict';

// Her chat's hands: what used to be three read-only tools (system info, open apps, files by name) now
// includes folders, files, a search and a command line — at the level in her menu, through the same
// guard a work order goes through. These are the tests for that half of tools.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tools = require('../src/main/tools');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-tools-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('a folder is listed, a file is read, and the search finds the line', (t) => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'const nova = 1;\nconst other = 2;\n');
  const ctx = { autonomy: 'full', root, home: root, appRoot: root };

  const listed = tools.listFolder('.', ctx);
  assert.equal(listed.entries.some((e) => e.name === 'src' && e.dir), true);

  const read = tools.readFileContent('src/app.js', 0, ctx);
  assert.match(read.text, /nova/);
  assert.equal(read.bytes, Buffer.byteLength('const nova = 1;\nconst other = 2;\n'));

  const hits = tools.searchInFolder('nova', '.', ctx);
  assert.equal(hits.hits.length, 1);
  assert.match(hits.hits[0].file, /app\.js$/);
  assert.equal(hits.hits[0].line, 1);

  // a binary is named, not decoded
  fs.writeFileSync(path.join(root, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.match(tools.readFileContent('shot.png', 0, ctx).error, /binary/);
});

test('below full access she stays in her home; at full she reads anywhere', (t) => {
  const root = scratch(t);
  const elsewhere = scratch(t);
  fs.writeFileSync(path.join(elsewhere, 'secret.txt'), 'outside\n');
  const guarded = { autonomy: 'guard', root, home: root };
  const full = { autonomy: 'full', root, home: root };

  const denied = tools.listFolder(elsewhere, guarded);
  assert.match(denied.error, /outside your home/);
  assert.equal(tools.listFolder(elsewhere, full).entries.length, 1);

  // a ~ path means the home folder, at every level
  fs.writeFileSync(path.join(root, 'here.txt'), 'here\n');
  assert.match(tools.readFileContent('~/here.txt', 0, guarded).text, /here/);
});

test('a command runs for her chat, at the level in her menu', async (t) => {
  const root = scratch(t);
  fs.writeFileSync(path.join(root, 'child.js'), "require('node:fs').writeFileSync('out.txt','ran')\n");
  const ctx = { autonomy: 'full', root, home: root };

  const ran = await tools.runCommand('node child.js', '.', ctx);
  assert.equal(ran.ok, true, `${ran.error || ''} ${ran.stderr || ''}`);
  assert.match(fs.readFileSync(path.join(root, 'out.txt'), 'utf8'), /ran/);
  assert.equal(ran.exit, 0);

  const refused = await tools.runCommand('format C:', '.', ctx);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /never run/);

  if (process.platform === 'win32') {
    const trusted = await tools.runCommand('powershell -NoProfile -Command "exit 0"', '.', { ...ctx, autonomy: 'trusted' });
    assert.equal(trusted.ok, false);
    assert.match(trusted.error, /full access/);
    const shell = await tools.runCommand('powershell -NoProfile -Command "exit 0"', '.', ctx);
    assert.equal(shell.ok, true, `${shell.error || ''} ${shell.stderr || ''}`);
  }
});

test('the screen reader is a tool, and says so when none is wired', async (t) => {
  const tools = require('../src/main/tools');
  tools.setScreenReader(null);
  assert.match((await tools.run('see_screen', {})).error, /not available/);
  tools.setScreenReader(async () => ({ ok: true, mode: 'ocr', text: 'на экране браузер' }));
  const seen = await tools.run('see_screen', {});
  assert.equal(seen.mode, 'ocr');
  assert.match(seen.text, /браузер/);
  tools.setScreenReader(null);
});

test('she is told where she is installed and how far her hands go', (t) => {
  const root = scratch(t);
  const where = tools.launchFolder({ autonomy: 'full', root, home: root, appRoot: 'C:\\Program Files\\Capri' });
  assert.equal(where.app, 'C:\\Program Files\\Capri');
  assert.equal(where.level, 'full');
  assert.equal(where.home, root);
  assert.ok(where.executable);
});
