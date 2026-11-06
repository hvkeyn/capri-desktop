'use strict';

// Running a command for a work order: no shell, the workspace as the working folder, a clock on it,
// and the tail of what it printed. guard.js decided whether it may run at all.

const { execFile } = require('node:child_process');
const guard = require('./guard');

const TIMEOUT_MS = 120000; // a build is allowed to take a while; a hang is not
const OUTPUT_MAX = 8000;   // characters kept from each stream

const tail = (text) => (text.length > OUTPUT_MAX ? `…${text.slice(-OUTPUT_MAX)}` : text);

function run(command, { root, autonomy = 'guard', timeout = TIMEOUT_MS, env = process.env } = {}) {
  const checked = guard.checkCommand(command, { autonomy });
  if (!checked.ok) return Promise.resolve({ ok: false, error: checked.reason, command: String(command || '') });
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(checked.argv[0], checked.argv.slice(1), {
      cwd: root,
      timeout: Math.min(Math.max(1000, Number(timeout) || TIMEOUT_MS), TIMEOUT_MS),
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      env: cleanEnv(env),
    }, (err, stdout, stderr) => {
      const ms = Date.now() - started;
      const out = tail(String(stdout || ''));
      const errOut = tail(String(stderr || ''));
      if (err?.killed) return resolve({ ok: false, error: `stopped after ${Math.round(ms / 1000)} s`, command: guard.show(checked.argv), out, stderr: errOut, ms });
      if (err) {
        return resolve({
          ok: false,
          code: typeof err.code === 'number' ? err.code : null,
          error: err.code === 'ENOENT' ? `"${checked.bin}" is not installed` : `exited with ${err.code ?? 'an error'}`,
          command: guard.show(checked.argv),
          out,
          stderr: errOut,
          ms,
        });
      }
      resolve({ ok: true, code: 0, command: guard.show(checked.argv), out, stderr: errOut, ms });
    });
  });
}

// Her commands don't need the proxy or the Electron switches this process was started with.
function cleanEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (/proxy/i.test(k) || k === 'ELECTRON_RUN_AS_NODE' || k === 'ELECTRON_NO_ATTACH_CONSOLE') continue;
    out[k] = v;
  }
  return out;
}

module.exports = { run, TIMEOUT_MS };
