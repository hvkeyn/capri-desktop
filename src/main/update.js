'use strict';

// Updates from the releases on GitHub, without a dependency: the portable exe this app ships as is one
// file, so an update is "download the new one, swap it when the app is closed, start it again".
//
// Three small pieces, and they are separate on purpose:
//   check()    reads the latest release (cached 12 h: the GitHub API is rate-limited and an update a day
//              late is not a problem);
//   download() streams the portable exe next to her own storage, with progress;
//   swap()     replaces the exe at the *next* start: a running exe cannot be replaced, but it can be
//              renamed, so the old one moves aside, the new one takes its path, and the app relaunches.
//
// Nothing here decides *whether* to bother the user: main.js does that, and the panel asks.

const fs = require('node:fs');
const path = require('node:path');

const REPO = 'hvkeyn/capri-desktop';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_MS = 12 * 60 * 60 * 1000; // 12 hours
const DOWNLOAD_MS = 10 * 60 * 1000;

// "v0.7.0" -> [0, 7, 0]; anything unparsable counts as 0, so a broken tag never looks newer.
const version = (text) => {
  const parts = String(text || '').replace(/^v/i, '').split(/[.+-]/);
  return [0, 1, 2].map((i) => {
    const n = parseInt(parts[i], 10);
    return Number.isFinite(n) ? n : 0;
  });
};

// Is `a` newer than `b`? (0.7.10 is newer than 0.7.9; 0.10.0 is newer than 0.9.9)
function newer(a, b) {
  const A = version(a);
  const B = version(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] !== B[i]) return A[i] > B[i];
  }
  return false;
}

// The asset to take: the portable exe for this exact version, else any portable, else any zip.
function pickAsset(assets = [], v) {
  const list = Array.isArray(assets) ? assets : [];
  const portable = list.find((a) => a.name === `Capri-${v}-portable.exe`)
    || list.find((a) => /-portable\.exe$/i.test(a.name))
    || null;
  const zip = list.find((a) => a.name === `Capri-${v}-win.zip`)
    || list.find((a) => /-win\.zip$/i.test(a.name))
    || null;
  return { portable, zip };
}

const readCache = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const writeCache = (file, data) => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    // no cache is a cache miss, not an error
  }
};

// The latest release, as this app cares about it. `force` skips the 12-hour cache; a failed check is
// cached too (for an hour) so a machine with no network doesn't hammer the API on every start.
async function check({ current, cacheFile = null, force = false, fetchImpl = globalThis.fetch, now = Date.now(), timeout = 15000 } = {}) {
  const cached = cacheFile ? readCache(cacheFile) : null;
  const ttl = cached && cached.ok === false ? 60 * 60 * 1000 : CACHE_MS;
  if (!force && cached && now - (cached.at || 0) < ttl) {
    // "newer" belongs to the caller's version, not to the cache: recompute it from what was stored
    const stored = cached.result || {};
    return {
      ...stored,
      ok: cached.ok !== false && !stored.error,
      newer: stored.latest ? newer(stored.latest, current) : false,
      cached: true,
    };
  }

  const result = { ok: false, error: null, latest: null, tag: null, url: null, notes: '', portable: null, zip: null, newer: false };
  try {
    const res = await fetchImpl(API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Capri' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const release = await res.json();
    const tag = String(release.tag_name || release.name || '');
    const latest = tag.replace(/^v/i, '');
    if (!latest) throw new Error('that release has no version');
    const assets = pickAsset(release.assets, latest);
    Object.assign(result, {
      ok: true,
      latest,
      tag,
      url: release.html_url || `https://github.com/${REPO}/releases/latest`,
      notes: String(release.body || '').slice(0, 2000),
      portable: assets.portable,
      zip: assets.zip,
      newer: newer(latest, current),
    });
  } catch (err) {
    result.error = err.message || 'the check failed';
  }
  if (cacheFile) {
    const stored = { ...result };
    delete stored.newer; // it depends on the version asking, not on the release
    writeCache(cacheFile, { at: now, ok: result.ok, result: stored });
  }
  return result;
}

// The portable exe, streamed to `dir`. It is 110+ MB: progress comes every few hundred milliseconds,
// and a failed download leaves nothing half-written behind.
async function download({ asset, dir, onProgress = () => {}, fetchImpl = globalThis.fetch, timeout = DOWNLOAD_MS } = {}) {
  if (!asset?.browser_download_url) return { ok: false, error: 'no file to download' };
  const file = path.join(dir, String(asset.name || 'Capri-update.exe'));
  const part = `${file}.part`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const res = await fetchImpl(asset.browser_download_url, {
      headers: { 'user-agent': 'Capri' },
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const total = Number(res.headers.get('content-length')) || Number(asset.size) || 0;
    const out = fs.createWriteStream(part);
    let got = 0;
    let last = 0;
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      got += chunk.length;
      if (Date.now() - last > 300) {
        last = Date.now();
        onProgress(total ? Math.min(1, got / total) : null, got, total);
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    fs.renameSync(part, file);
    onProgress(1, got, total);
    return { ok: true, file, bytes: got };
  } catch (err) {
    try { fs.rmSync(part, { force: true }); } catch { /* nothing to clean */ }
    return { ok: false, error: err.message || 'the download failed' };
  }
}

// The file a portable build really is. electron-builder's portable target runs the app from a temp
// folder: PORTABLE_EXECUTABLE_FILE is the exe the user double-clicked, and that is the one to replace.
function portableTarget(env = process.env, execPath = process.execPath) {
  return env.PORTABLE_EXECUTABLE_FILE || execPath || null;
}

// A running exe cannot be replaced, but it can be moved: Windows keeps the image mapped while the path
// frees up. So the update is applied at the *next* start, before the window exists: the old exe is
// renamed out of the way, the downloaded one is copied into its path, and the app starts again from it.
// (Tested on this machine against a running exe, not just a file on disk.)

function swap({ file, target = portableTarget(), tries = 4, pause = 300 } = {}) {
  if (!file || !target) return { ok: false, error: 'nothing to swap' };
  if (!fs.existsSync(file)) return { ok: false, error: 'the downloaded file is gone' };
  if (!fs.existsSync(target)) return { ok: false, error: `there is no file at ${target}` };
  const backup = `${target}.old`;
  let last = null;
  // an antivirus or the shell's own copy can hold the exe for a moment: a few tries, not one
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      fs.rmSync(backup, { force: true });      // a leftover of the update before this one
      fs.renameSync(target, backup);           // allowed while it runs: the image stays mapped
      fs.copyFileSync(file, target);
      return { ok: true, backup };
    } catch (err) {
      last = err;
      // the copy failed after the rename: put the old exe back before the next try
      try {
        if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
      } catch { /* the error below is the one worth reporting */ }
      if (attempt + 1 < tries) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
    }
  }
  return { ok: false, error: last?.message || 'could not replace the exe' };
}

// Called at a start: by then the previous exe is not running, so its backup can go.
function cleanup(target = portableTarget()) {
  if (!target) return false;
  try {
    fs.rmSync(`${target}.old`, { force: true });
    return true;
  } catch {
    return false;
  }
}
module.exports = { REPO, API, CACHE_MS, version, newer, pickAsset, check, download, swap, cleanup, portableTarget };
