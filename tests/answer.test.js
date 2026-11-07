'use strict';

// Her answer, cut for reading: paragraphs, the bold and code she wrote, and the numbers that carry meaning.
// A pure function, tested away from the panel.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

const load = () => import(moduleUrl(path.join(__dirname, '../src/renderer/js/answer.js')));

test('blank lines become paragraphs, single newlines stay inside one', async () => {
  const { paragraphs } = await load();
  const parts = paragraphs('Первый абзац.\nОн из двух строк.\n\nВторой абзац.');
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, 'Первый абзац.\nОн из двух строк.');
  assert.equal(parts[1].text, 'Второй абзац.');
  assert.deepEqual(paragraphs('   '), []);
});

test('the numbers that carry meaning are their own segments', async () => {
  const { paragraphs } = await load();
  const [part] = paragraphs('Память 50 из 64 ГБ, свободно 62.9 ГБ, загрузка 4 %, GPU 49 °C, ждал 2.1 s.');
  const nums = part.segments.filter((s) => s.type === 'num').map((s) => s.text);
  assert.deepEqual(nums, ['64 ГБ', '62.9 ГБ', '4 %', '49 °C', '2.1 s']);
  // a bare number without a unit is not a fact to highlight, and the text between them is still in order
  const rebuilt = part.segments.map((s) => s.text).join('');
  assert.equal(rebuilt, part.text);
});

test('bold and code from her own text are marked, not shown as punctuation', async () => {
  const { paragraphs } = await load();
  const [part] = paragraphs('**Файлы:** `news.json` и всё.');
  const kinds = part.segments.map((s) => s.type);
  assert.deepEqual(kinds, ['b', 'text', 'code', 'text']);
  assert.equal(part.segments[0].text, 'Файлы:');
  assert.equal(part.segments[2].text, 'news.json');
  // a stray asterisk is text, not a tag
  const [odd] = paragraphs('5 * 3 = 15');
  assert.equal(odd.segments.some((s) => s.type === 'b'), false);
});

test('a phrase in quotes is a key word, not punctuation', async () => {
  const { paragraphs } = await load();
  const [part] = paragraphs('Держи «Тибериум» под контролем: 3 базы.');
  const key = part.segments.find((s) => s.type === 'key');
  assert.equal(key.text, 'Тибериум');
  assert.equal(part.segments[0].text, 'Держи ');
});

test('a bear of an answer with markdown headings is still just text', async () => {
  const { paragraphs } = await load();
  const parts = paragraphs('## Сводка\n\n- первый\n- второй');
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, '## Сводка');
  assert.equal(parts[1].text, '- первый\n- второй');
});
