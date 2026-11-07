'use strict';

// Reading a picture without a vision model: the choice between the Russian engine and the English one, and
// what happens when there is nothing to read.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ocr = require('../src/main/ocr');

test('a Russian result is chosen only when it really is Cyrillic', () => {
  const ru = 'Сегодня на экране браузер и терминал с логами';
  const transliterated = 'Cegodnya na ekrane brauzer i terminal';
  assert.ok(ocr.quality(ru, 'ru') > 0.9);
  assert.equal(ocr.quality(transliterated, 'ru'), 0);
  assert.ok(ocr.quality('hello world of night city', 'en-US') > 0.9);
});

test('nothing to read is an answer, not a crash', async () => {
  const missing = path.join(os.tmpdir(), 'capri-nope-' + Date.now() + '.png');
  const out = await ocr.recognize(missing);
  assert.equal(out.ok, false);
  assert.match(out.error, /no picture/);
});
