'use strict';

// Updates from GitHub, without the network: version order, asset choice, a cached check, a streamed
// download and the little helper that swaps the exe after the app has closed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const updater = require('../src/main/update');

const scratch = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-update-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

const release = (version, over = {}) => new Response(JSON.stringify({
  tag_name: `v${version}`,
  html_url: `https://github.com/hvkeyn/capri-desktop/releases/tag/v${version}`,
  body: 'notes',
  assets: [
    { name: `Capri-${version}-portable.exe`, browser_download_url: 'https://example/portable', size: 10 },
    { name: `Capri-${version}-win.zip`, browser_download_url: 'https://example/zip', size: 20 },
  ],
  ...over,
}), { status: 200, headers: { 'content-type': 'application/json' } });

test('a version is newer when it is, and never when it is the same', () => {
  assert.equal(updater.newer('0.7.1', '0.7.0'), true);
  assert.equal(updater.newer('0.8.0', '0.7.9'), true);
  assert.equal(updater.newer('0.10.0', '0.9.9'), true);
  assert.equal(updater.newer('v1.0.0', '0.9.9'), true);
  assert.equal(updater.newer('0.7.0', '0.7.0'), false);
  assert.equal(updater.newer('0.6.9', '0.7.0'), false);
  assert.equal(updater.newer('', '0.7.0'), false);
});

test('the portable exe for that version is preferred, then any, then the zip', () => {
  const assets = [
    { name: 'Capri-9.8.0-portable.exe' },
    { name: 'Capri-9.9.0-portable.exe' },
    { name: 'Capri-9.9.0-win.zip' },
  ];
  const chosen = updater.pickAsset(assets, '9.9.0');
  assert.equal(chosen.portable.name, 'Capri-9.9.0-portable.exe');
  assert.equal(chosen.zip.name, 'Capri-9.9.0-win.zip');
  assert.equal(updater.pickAsset([{ name: 'Capri-9.9.0-portable.exe' }], '9.9.0').zip, null);
  assert.equal(updater.pickAsset([], '9.9.0').portable, null);
});

test('the latest release is read once and then cached', async (t) => {
  const cacheFile = path.join(scratch(t), 'update.json');
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return release('9.9.9'); };

  const first = await updater.check({ current: '0.7.0', cacheFile, fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(first.latest, '9.9.9');
  assert.equal(first.newer, true);
  assert.equal(first.portable.name, 'Capri-9.9.9-portable.exe');
  assert.equal(first.url, 'https://github.com/hvkeyn/capri-desktop/releases/tag/v9.9.9');

  const second = await updater.check({ current: '9.9.9', cacheFile, fetchImpl });
  assert.equal(second.cached, true);
  assert.equal(calls, 1, 'the second check came from the cache');
  // the cache holds the release, not the verdict: asking from the same version must not say "newer"
  assert.equal(second.newer, false);
  assert.equal(second.latest, '9.9.9');
});

test('a check that fails is cached briefly and says why', async (t) => {
  const cacheFile = path.join(scratch(t), 'update.json');
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('offline'); };
  const first = await updater.check({ current: '0.7.0', cacheFile, fetchImpl });
  assert.equal(first.ok, false);
  assert.match(first.error, /offline/);
  const second = await updater.check({ current: '0.7.0', cacheFile, fetchImpl });
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  // and a forced check goes out again
  await updater.check({ current: '0.7.0', cacheFile, fetchImpl, force: true });
  assert.equal(calls, 2);
});

test('the download streams to a file and reports progress', async (t) => {
  const dir = scratch(t);
  const body = Buffer.from('x'.repeat(4096));
  const fetchImpl = async () => new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
  const seen = [];
  const out = await updater.download({
    asset: { name: 'Capri-9.9.9-portable.exe', browser_download_url: 'https://example/portable' },
    dir,
    fetchImpl,
    onProgress: (share) => seen.push(share),
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(fs.readFileSync(out.file).length, 4096);
  assert.equal(seen.at(-1), 1);
  // nothing half-written is left behind
  assert.equal(fs.existsSync(`${out.file}.part`), false);
});

test('applying writes a helper that waits for the app, swaps the exe and starts it', (t) => {
  const dir = scratch(t);
  let spawned = null;
  const spawnImpl = (command, args) => {
    spawned = { command, args };
    return { unref() {} };
  };
  const result = updater.apply({
    file: 'C:\\updates\\Capri-9.9.9-portable.exe',
    target: 'C:\\Apps\\Capri.exe',
    pid: 4242,
    spawnImpl,
    dir,
  });
  assert.equal(result.ok, true);
  assert.equal(spawned.command, 'powershell.exe');
  assert.ok(spawned.args.includes(result.helper));
  const script = fs.readFileSync(result.helper, 'utf8');
  assert.match(script, /\$ProcessId = 4242/);
  assert.match(script, /C:\\Apps\\Capri\.exe/);
  assert.match(script, /C:\\updates\\Capri-9\.9\.9-portable\.exe/);
  assert.match(script, /Copy-Item/);
  assert.match(script, /Start-Process/);
  assert.match(script, /Remove-Item/);
});

test('the portable exe is the one the user double-clicked, not the temp copy', () => {
  assert.equal(updater.portableTarget({ PORTABLE_EXECUTABLE_FILE: 'D:\\Capri-0.7.0-portable.exe' }, 'C:\\Temp\\x\\Capri.exe'),
    'D:\\Capri-0.7.0-portable.exe');
  assert.equal(updater.portableTarget({}, 'C:\\Temp\\x\\Capri.exe'), 'C:\\Temp\\x\\Capri.exe');
});
