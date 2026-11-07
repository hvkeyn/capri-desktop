'use strict';

// The character's own lines beyond the skin: what a model wrote is checked, kept, merged without repeats,
// and read back — including the offline morning when no model answers at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const store = require('../src/main/lines-store');
const gen = require('../src/main/lines-gen');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-lines-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('only short, unique, well-named lines are kept', () => {
  const packs = store.sanitize({
    hello: ['  Привет, choom.  ', 'Привет, choom.', '', 42, 'x'.repeat(400)],
    'bad kind!': ['nope'],
    idle: ['Тишина.'],
  });
  assert.deepEqual(packs.hello, ['Привет, choom.']);
  assert.deepEqual(packs.idle, ['Тишина.']);
  assert.equal(packs['bad kind'], undefined);
});

test('a batch is merged over what is already there, without duplicates or runaway lists', (t) => {
  const base = scratch(t);
  const first = store.merge(base, 'johnny', 'ru', { hello: ['Раз.', 'Два.'] });
  assert.equal(first.ok, true);
  assert.deepEqual(first.packs.hello, ['Раз.', 'Два.']);

  const second = store.merge(base, 'johnny', 'ru', { hello: ['Два.', 'Три.'] });
  assert.deepEqual(second.packs.hello, ['Раз.', 'Два.', 'Три.']);

  const many = Array.from({ length: 200 }, (_, i) => `Строка ${i}.`);
  const capped = store.merge(base, 'johnny', 'ru', { hello: many });
  assert.equal(capped.packs.hello.length, store.MAX_PER_KIND);

  // a different character or language is its own file
  store.merge(base, 'johnny', 'en', { hello: ['One.'] });
  assert.deepEqual(store.load(base, 'johnny', 'ru').hello.length, store.MAX_PER_KIND);
  assert.deepEqual(store.load(base, 'johnny', 'en').hello, ['One.']);
  assert.deepEqual(store.load(base, 'capri', 'ru'), {});
});

test('the prompt asks for JSON, in the language and the voice, and only for the kinds wanted', () => {
  const messages = gen.messages({ character: 'Johnny', persona: ['You are Johnny Silverhand.'], lang: 'ru', kinds: ['hello', 'done'], perKind: 4 });
  assert.equal(messages.length, 2);
  const user = messages[1].content;
  assert.match(user, /hello/);
  assert.match(user, /done/);
  assert.doesNotMatch(user, /idle/);
  assert.match(user, /Russian/);
  assert.match(user, /JSON/);
  assert.match(messages[0].content, /Johnny Silverhand/);
});

test('what the model answers is parsed, fenced or not, and only the wanted kinds survive', async () => {
  assert.deepEqual(gen.parse('```json\n{"hello":["a"]}\n```'), { hello: ['a'] });
  assert.deepEqual(gen.parse('Вот: {"hello":["a"]} — готово'), { hello: ['a'] });
  assert.equal(gen.parse('no json here'), null);

  const asked = [];
  const out = await gen.generate({
    ask: async (messages) => {
      asked.push(messages);
      return '{"hello":["Раз."],"idle":["Тишина."],"nonsense":["x"]}';
    },
    character: 'Johnny',
    lang: 'ru',
    kinds: ['hello', 'idle'],
    perKind: 2,
  });
  assert.equal(out.ok, true);
  assert.deepEqual(Object.keys(out.packs).sort(), ['hello', 'idle']);
  assert.equal(asked.length, 1);

  const failed = await gen.generate({ ask: async () => 'sorry, no', lang: 'ru' });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /JSON/);
});
