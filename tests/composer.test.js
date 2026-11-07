'use strict';

// What a message with files carries to the model: a heading with each name and the text read from it — OCR
// for a picture, the file itself for text. The composer's own DOM is not tested here; this part is pure.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

const load = () => import(moduleUrl(path.join(__dirname, '../src/renderer/js/composer.js')));

test('a file becomes a heading and its text, and a picture says what was read off it', async () => {
  const { fileContext } = await load();
  const text = fileContext([
    { name: 'notes.txt', text: 'первая строка' },
    { name: 'shot.png', text: '[text on the picture]\nскриншот' },
  ]);
  assert.match(text, /\[Приложен файл: notes\.txt\]\nпервая строка/);
  assert.match(text, /shot\.png/);
  assert.match(text, /скриншот/);
});

test('a file with nothing readable still names itself, and nothing means nothing', async () => {
  const { fileContext } = await load();
  assert.match(fileContext([{ name: 'blob.bin' }]), /текст не прочитан/);
  assert.equal(fileContext([]), '');
  assert.equal(fileContext(null), '');
});
