'use strict';

// A smoke test of the overlay itself: start her on a throwaway profile, look at what the renderer
// really built, and close again. No screenshots, no clicking: it drives the board through
// window.__capri (exposed by app.js), which is the same object the tray and her chat drive.
//
//   node scripts/smoke.js
//
// It passes when there were no page exceptions, the board's stylesheet is on, and a fake work order
// renders its five phases, its steps and its clock.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 9300 + Math.floor(Math.random() * 400);
const CAPRI_PORT = 47000 + Math.floor(Math.random() * 900);
const PROFILE = path.join(os.tmpdir(), `capri-smoke-${process.pid}`);
const ROOT = path.resolve(__dirname, '..');
const WAIT_MS = 25000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) });
  return res.json();
}

// One message over the DevTools protocol, and its answer.
function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  const events = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve } = waiting.get(msg.id);
      waiting.delete(msg.id);
      resolve(msg);
      return;
    }
    events.push(msg);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const at = ++id;
    waiting.set(at, { resolve });
    ws.send(JSON.stringify({ id: at, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return res.result?.result?.value;
  };
  return { ready, send, evaluate, events, close: () => ws.close() };
}

function fakeOrder() {
  const now = Date.now();
  return {
    id: '004-tidy-the-nav',
    goal: 'tidy the navigation and make the header sticky',
    workspace: 'C:\\Users\\me\\Capri Workspace\\site',
    slug: '004-tidy-the-nav',
    phase: 'build',
    phaseTitle: 'Build',
    phases: ['spec', 'plan', 'tasks', 'build', 'report'].map((id) => ({ id, title: id })),
    status: 'running',
    error: null,
    steps: [
      { id: 'T001', title: 'read the header component', phase: 'Write', status: 'done', note: 'read it', startedAt: now - 6000, endedAt: now - 5000 },
      { id: 'T002', title: 'make the header sticky', phase: 'Write', status: 'running', note: '', startedAt: now - 4000, endedAt: null },
      { id: 'T003', title: 'run the tests', phase: 'Check', status: 'queued', note: '', startedAt: null, endedAt: null },
    ],
    counts: { queued: 1, running: 1, done: 1, failed: 0, skipped: 0 },
    current: { id: 'T002', title: 'make the header sticky' },
    log: [{ at: now, kind: 'file', text: 'PATCHES src/header.css' }, { at: now, kind: 'run', text: 'RUNS npm test' }],
    startedAt: now - 9000,
    endedAt: null,
    elapsedMs: 9000,
  };
}

(async () => {
  const electron = require('electron');
  fs.mkdirSync(PROFILE, { recursive: true });
  // The environment this is started from may be a Node inside an Electron (the harness runs that way):
  // ELECTRON_RUN_AS_NODE would turn the app into a bare Node and it would never open a window.
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(ELECTRON_|NODE_OPTIONS$|.*proxy.*$)/i.test(key)) continue;
    env[key] = value;
  }
  env.CAPRI_PORT = String(CAPRI_PORT);
  const child = spawn(electron, ['.', '--dev', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = [];
  child.stdout.on('data', (d) => out.push(String(d)));
  child.stderr.on('data', (d) => out.push(String(d)));

  let failure = null;
  let client = null;
  try {
    const deadline = Date.now() + WAIT_MS;
    let page = null;
    while (Date.now() < deadline && !page) {
      await sleep(400);
      try {
        page = (await targets()).find((t) => t.type === 'page' && /capri:\/\/app/.test(t.url));
      } catch {
        // not listening yet
      }
    }
    if (!page) throw new Error(`the overlay never came up (log: ${out.join('').slice(-500)})`);

    client = connect(page.webSocketDebuggerUrl);
    await client.ready;
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    await sleep(1200); // the renderer's first frame, and its modules

    const alive = await client.evaluate('Boolean(window.__capri && window.__capri.board)');
    if (!alive) throw new Error('the renderer did not expose window.__capri');
    const styles = await client.evaluate('getComputedStyle(document.getElementById("board")).zIndex');
    if (styles !== '4') throw new Error(`board.css is not on (z-index ${styles})`);

    const rendered = await client.evaluate(`(() => {
      const { board } = window.__capri;
      board.update(${JSON.stringify(fakeOrder())});
      const q = (sel) => document.querySelector(sel);
      return {
        open: !document.getElementById('board').hidden,
        phases: document.querySelectorAll('.board__phase').length,
        steps: document.querySelectorAll('.board__step').length,
        now: q('.board__now-step').textContent,
        chip: q('.board__chip').textContent,
        meter: q('.board__meter-bar').style.transform,
        aria: document.getElementById('board').getAttribute('aria-label'),
      };
    })()`);
    if (!rendered.open) throw new Error('the board did not open');
    if (rendered.phases !== 5) throw new Error(`five phases expected, ${rendered.phases} drawn`);
    if (rendered.steps !== 3) throw new Error(`three steps expected, ${rendered.steps} drawn`);
    if (!/T002/.test(rendered.now)) throw new Error(`the step she is on isn't the headline: ${rendered.now}`);
    if (!rendered.chip) throw new Error('no status chip');
    if (rendered.meter !== 'scaleX(0.333)') throw new Error(`the meter didn't move: ${rendered.meter}`);

    // the order form is the other half of the board: it must open with a field and a folder line
    const order = await client.evaluate(`(() => {
      window.__capri.board.showOrder('C:\\\\Users\\\\me\\\\site');
      return {
        form: !document.querySelector('.board__order').hidden,
        input: Boolean(document.querySelector('.board__goal-input, #board-goal')),
        ws: document.querySelector('.board__ws').textContent,
      };
    })()`);
    if (!order.form || !order.input) throw new Error('the work-order form did not come up');
    if (!/site/.test(order.ws)) throw new Error(`the folder isn't shown: ${order.ws}`);

    const exceptions = client.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    const errors = client.events.filter((e) => e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error');
    if (exceptions.length) throw new Error(`page exception: ${JSON.stringify(exceptions[0].params.exceptionDetails?.text)}`);
    if (errors.length) throw new Error(`console error: ${errors[0].params.entry.text}`);
    console.log('smoke passed:', JSON.stringify(rendered));
  } catch (err) {
    failure = err;
    console.error('smoke failed:', err.message);
    const tail = out.join('').trim().split('\n').slice(-12).join('\n');
    if (tail) console.error(tail);
  } finally {
    client?.close();
    child.kill();
    await sleep(300);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* still locked */ }
    process.exit(failure ? 1 : 0);
  }
})();
