'use strict';

// Search and file work — the Kensaku ideas that fit here: name-first finding with the letters in order,
// filters in the query, and file work that can be undone (delete means "into the bin").

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fss = require('../src/main/fss');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-fss-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('a name is scored by how you remember it: exact, prefix, inside, then the letters in order', () => {
  assert.ok(fss.scoreName('report.pdf', 'report.pdf').score > fss.scoreName('report.pdf', 'report').score);
  assert.ok(fss.scoreName('report.pdf', 'report').score > fss.scoreName('final-report.pdf', 'report').score);
  assert.ok(fss.scoreName('final-report.pdf', 'report').score > fss.scoreName('r_e_p_o_r_t.txt', 'report').score);
  assert.equal(fss.scoreName('report.pdf', 'zzz'), null);
});

test('the query carries the filters people actually type', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  const q = fss.parseQuery('ext:pdf,md in:projects modified:>7d size:>10mb invoice', now);
  assert.deepEqual(q.terms, ['invoice']);
  assert.deepEqual(q.ext, ['pdf', 'md']);
  assert.equal(q.inPath, 'projects');
  assert.equal(q.modifiedAfter, now - 7 * 86400000);
  assert.equal(q.sizeMin, 10 * 1024 * 1024);

  const week = fss.parseQuery('screenshots last week', now);
  assert.deepEqual(week.terms, ['screenshots']);
  assert.equal(week.modifiedAfter, now - 7 * 86400000);

  const ru = fss.parseQuery('скриншоты за последнюю неделю', now);
  assert.deepEqual(ru.terms, ['скриншоты']);
  assert.equal(ru.modifiedAfter, now - 7 * 86400000);
});

test('a bare extension is a filter, and "в проекте" is a scope', () => {
  const q = fss.parseQuery('png в проекте за последнюю неделю');
  assert.deepEqual(q.terms, []);
  assert.deepEqual(q.ext, ['png']);
  assert.equal(q.project, true);
  assert.ok(q.modifiedAfter);

  const md = fss.parseQuery('report md');
  assert.deepEqual(md.terms, ['report']);
  assert.deepEqual(md.ext, ['md']);
});

test('a short word must appear as written, not be spelled across a name', () => {
  assert.equal(fss.scoreName('interesting.png', 'png').exact, true);
  assert.equal(fss.scoreName('p-i-n-g.txt', 'p i n g'), null);
  // three letters must appear as written; four may be matched in order
  assert.equal(fss.scoreName('project-board.js', 'pbd'), null);
  const fuzzy = fss.scoreName('project-board.js', 'prbd');
  assert.ok(fuzzy.score > 0);
  assert.equal(fuzzy.exact, false);
});

test('search ranks by the name and honours the filters', () => {
  const now = Date.now();
  const entries = [
    { p: '/a/report.pdf', n: 'report.pdf', d: false, s: 100, m: now },
    { p: '/a/final-report.pdf', n: 'final-report.pdf', d: false, s: 100, m: now - 10 * 86400000 },
    { p: '/a/notes.txt', n: 'notes.txt', d: false, s: 100, m: now },
    { p: '/a/Projects/report.md', n: 'report.md', d: false, s: 100, m: now },
    { p: '/a/report-folder', n: 'report-folder', d: true, s: 0, m: now },
  ];
  const all = fss.search(entries, 'report', { limit: 10, now });
  assert.equal(all[0].name, 'report.pdf');
  assert.equal(all.some((r) => r.dir), false); // folders come from tree(), not from a name search

  const md = fss.search(entries, 'report ext:md', { limit: 10, now });
  assert.deepEqual(md.map((r) => r.name), ['report.md']);

  const recent = fss.search(entries, 'report modified:>7d', { limit: 10, now });
  assert.equal(recent.some((r) => r.name === 'final-report.pdf'), false);

  const scoped = fss.search(entries, 'report in:projects', { limit: 10, now });
  assert.deepEqual(scoped.map((r) => r.name), ['report.md']);
});

test('the index walks a folder once and remembers it', (t) => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, 'deep', 'deeper'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  fs.writeFileSync(path.join(root, 'deep', 'b.txt'), 'b');
  fs.writeFileSync(path.join(root, 'deep', 'deeper', 'c.txt'), 'c');
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', 'junk.txt'), 'x');

  fss.resetIndex();
  const first = fss.index(root, { force: true });
  assert.equal(first.cached, false);
  assert.equal(first.entries.filter((e) => !e.d).length, 3); // node_modules is skipped
  const again = fss.index(root);
  assert.equal(again.cached, true);
  assert.equal(again.entries.length, first.entries.length);
});

test('a file is copied, moved and put in the bin, and the bin keeps it', (t) => {
  const root = scratch(t);
  const from = path.join(root, 'one.txt');
  fs.writeFileSync(from, 'hello');

  const copied = fss.copy(from, path.join(root, 'out', 'two.txt'));
  assert.equal(copied.ok, true, copied.error);
  assert.equal(fs.readFileSync(path.join(root, 'out', 'two.txt'), 'utf8'), 'hello');

  const moved = fss.move(path.join(root, 'out', 'two.txt'), path.join(root, 'three.txt'));
  assert.equal(moved.ok, true, moved.error);
  assert.equal(fs.existsSync(path.join(root, 'out', 'two.txt')), false);

  const binned = fss.toTrash(from);
  assert.equal(binned.ok, true, binned.error);
  assert.equal(fs.existsSync(from), false);
  assert.equal(fs.existsSync(binned.inBin), true);
  assert.match(binned.inBin, /one\.txt$/);

  // a folder is refused by copy: that is a work order, not a keystroke
  fs.mkdirSync(path.join(root, 'dir'));
  assert.match(fss.copy(path.join(root, 'dir'), path.join(root, 'copy')).error, /only a file/);
});

test('a folder tree is names, depth-limited', (t) => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, 'src', 'main'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'main', 'x.js'), '');
  fs.writeFileSync(path.join(root, 'README.md'), '');
  const tree = fss.tree(root, { depth: 3 });
  assert.ok(tree.lines.some((line) => /src\//.test(line)));
  assert.ok(tree.lines.some((line) => /x\.js/.test(line)));
  assert.ok(tree.lines.some((line) => /README\.md/.test(line)));
  assert.equal(tree.root, root);
});

test('stat says what a thing is', (t) => {
  const root = scratch(t);
  const file = path.join(root, 'a.bin');
  fs.writeFileSync(file, '12345');
  const info = fss.stat(file);
  assert.equal(info.dir, false);
  assert.equal(info.bytes, 5);
  assert.equal(info.extension, '.bin');
  assert.match(fss.stat(path.join(root, 'nope')).error, /no such/);
});
