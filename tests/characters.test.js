'use strict';

// A character is a folder (characters.js): what its skin.json is allowed to say, and what it is not.
// The two skins this build ships are read here as well, so a wrong path in one of them shows up as a
// failing test instead of a picture that never loads.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const characters = require('../src/main/characters');

const ROOT = path.resolve(__dirname, '..');
// a folder that is not there: the skins this build ships, with none of the user's
const NO_USER = path.join(os.tmpdir(), `capri-no-user-characters-${process.pid}`);

// a throwaway characters folder, with one skin in it (a folder of its own, as they are read) written
// from `skin`, and the files it names. It gives back the skin's own folder.
function folder(skin, files = ['full.png']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-skins-'));
  const dir = path.join(root, 'one');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify(skin));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), 'not a picture, but it is there');
  }
  return dir;
}

const dirs = (skinDir) => ({ userDir: path.dirname(skinDir), assetsDir: path.join(ROOT, 'assets', 'characters') });
// the skins this build ships, read with no user folder at all
const BUILTIN = { userDir: NO_USER, assetsDir: path.join(ROOT, 'assets', 'characters') };

test('a skin names its own windows, and only a theme it could have', () => {
  const dir = folder({ label: 'Test', theme: 'yorha' });
  const skin = characters.get('one', dirs(dir));
  assert.equal(skin.theme, 'yorha');
  // a theme is a stylesheet's id: no path, no markup
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ label: 'Test', theme: '../../etc/passwd' }));
  assert.equal(characters.get('one', dirs(dir)).theme, '');
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ label: 'Test', theme: 'A b' }));
  assert.equal(characters.get('one', dirs(dir)).theme, '');
});

test('a skin can turn off the violet copy behind the figure, and only down', () => {
  const dir = folder({ label: 'Test', rim: 0 });
  assert.equal(characters.get('one', dirs(dir)).rim, 0);
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ label: 'Test', rim: 3 }));
  assert.equal(characters.get('one', dirs(dir)).rim, 1);
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ label: 'Test' }));
  assert.equal(characters.get('one', dirs(dir)).rim, null); // hers, unless the art says otherwise
});

test('an entrance can be a film: its own sound, its own fade, captions in seconds', () => {
  const dir = folder({
    label: 'Test',
    intro: {
      video: 'intro/entrance.mp4',
      volume: 0.5,
      fade: 3,
      captionsByLang: { en: [{ at: 3, text: 'WAKE UP' }, { text: 'no time, dropped' }] },
      line: 'On the desktop now.',
    },
  }, ['full.png', 'intro/entrance.mp4']);
  const skin = characters.get('one', dirs(dir));
  assert.equal(skin.intro.video, `capri://app/characters/one/intro/entrance.mp4`);
  assert.equal(skin.intro.volume, 0.5);
  assert.equal(skin.intro.fade, 3);
  assert.deepEqual(skin.intro.frames, []);
  assert.deepEqual(skin.intro.captionsByLang.en, [{ from: 0, at: 3, text: 'WAKE UP' }, { from: 0, at: null, text: 'no time, dropped' }]);
  assert.equal(skin.intro.line, 'On the desktop now.');
  // a film is not a picture, but it must still be a media file inside the skin
  for (const video of ['intro/entrance.exe', '../out.mp4', '/abs.mp4']) {
    fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify({ label: 'Test', intro: { video } }));
    assert.equal(characters.get('one', dirs(dir)).intro, null, video);
  }
});

test('the entrance a skin brings keeps its captions and its line in every language', () => {
  const skin = characters.get('a2', BUILTIN);
  assert.ok(skin, 'the a2 skin ships with the app');
  assert.equal(skin.theme, 'yorha');
  assert.equal(skin.rim, 0);
  assert.equal(skin.flat, true);
  assert.ok(skin.intro.video.endsWith('/intro/entrance.mp4'));
  assert.equal(skin.intro.fade, 2.2);
  assert.ok(skin.intro.captionsByLang.ru.length && skin.intro.captionsByLang.en.length);
  assert.ok(skin.intro.captionsByLang.ru.every((c) => Number.isFinite(c.at)));
  assert.ok(skin.intro.lineByLang.ru.length && skin.intro.lineByLang.en.length);
  // every picture it names is there, and every pose it names is a different one
  const base = path.join(ROOT, 'assets', 'characters', 'a2');
  for (const file of [skin.sprite, ...Object.values(skin.poses), ...Object.values(skin.cutins), skin.intro.video]) {
    const rel = file.replace('capri://app/assets/characters/a2/', '');
    assert.ok(fs.existsSync(path.join(base, rel)), rel);
  }
  assert.equal(new Set(Object.values(skin.poses)).size, Object.keys(skin.poses).length);
  // its loops are real loops, and its words are its own
  for (const loop of Object.values(skin.animations)) assert.ok(loop.frames.length > 2, 'a loop of drawings');
  assert.ok(skin.lines.ru.hello.length > 3 && skin.lines.en.hello.length > 3);
});

test('a character with a theme is offered with it, and her own are untouched', () => {
  const list = characters.list(BUILTIN);
  assert.deepEqual(list.map((c) => c.id).sort(), ['a2', 'capri', 'johnny']);
  const johnny = characters.get('johnny', BUILTIN);
  assert.equal(johnny.theme, ''); // he never asked for one
  assert.equal(johnny.rim, null);
  assert.equal(johnny.intro.video, '');
  assert.ok(johnny.intro.frames.length > 90); // his entrance is still the storyboard it was
});


