'use strict';

// A terminal has the harness's own proxy switches in its environment (NODE_USE_ENV_PROXY and a proxy
// meant for other providers); Node 24 would send this API call through it and it isn't always up. The
// app itself doesn't have that problem — this is only so the script can be run from here.
for (const key of Object.keys(process.env)) {
  if (key === 'NODE_USE_ENV_PROXY' || /^(https?_proxy|all_proxy)$/i.test(key)) delete process.env[key];
}

// One real work order, on a real folder, through the same runner the board drives — but from a terminal,
// so the whole thing can be read as it happens:
//
//   node scripts/try-work.js "make a hello.txt that says nova" [folder]
//
// The provider and the model are the ones her setup uses (config.json), and the key comes from
// DEEPSEEK_API_KEY or from that same file — nothing is printed, nothing leaves for anywhere else.
// Use a scratch folder: this is a test of her, not a job you care about.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Runner } = require('../src/main/agent/runner');

const GOAL_FALLBACK = 'make a file called hello.txt that says nova, and a README that explains it';
const goal = process.argv[2] || GOAL_FALLBACK;
const folder = path.resolve(process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'capri-try-')));
const given = process.argv.slice(4); // files to hand her, as the board's picker would

function herConfig() {
  const file = path.join(process.env.APPDATA || '', 'capri-desktop', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

const cfg = herConfig();
const provider = cfg.provider || 'deepseek';
const model = cfg.chatModel || 'deepseek-flash';
const key = process.env.DEEPSEEK_API_KEY || cfg.apiKeys?.deepseek || '';
if (!key) {
  console.error('FAIL  no key: set DEEPSEEK_API_KEY, or set her up once in the app');
  process.exit(1);
}
// llm.js reads the provider's key from the environment; this is that, for this process only
if (provider === 'deepseek') process.env.DEEPSEEK_API_KEY = key;

const llm = require('../src/main/llm');

async function ask({ messages, tools = [], signal }) {
  if (tools.length) {
    const res = await llm.chatTools(provider, cfg, { model, messages, tools }, () => {}, signal);
    return { text: res.text || '', toolCalls: res.toolCalls || [] };
  }
  const text = await llm.chat(provider, cfg, { model, messages }, () => {}, signal);
  return { text: text || '', toolCalls: [] };
}

// The same voice the desktop would use: Johnny Silverhand, if that's who's on it tonight.
function narrator() {
  const dir = path.join(process.env.APPDATA || '', 'capri-desktop', 'characters');
  const assets = path.join(__dirname, '..', 'assets', 'characters');
  for (const base of [dir, assets]) {
    try {
      const skin = JSON.parse(fs.readFileSync(path.join(base, 'johnny', 'skin.json'), 'utf8'));
      return { name: skin.name || 'Johnny Silverhand', persona: skin.persona };
    } catch {
      // no skin there
    }
  }
  return { name: 'Capri', persona: [] };
}

let lastPhase = '';
let lastStep = '';
const runner = new Runner({
  ask,
  store: { savePlan() {}, observe() {} },
  autonomy: 'full',
  narrator: narrator(),
  emit(state) {
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      console.log(`\n[${state.phase.toUpperCase()}]`);
    }
    const current = state.current ? state.current.id : '';
    if (state.current && current !== lastStep) {
      lastStep = current;
      console.log(`  ${current} · ${state.current.title}`);
    }
    const line = state.log?.at(-1);
    if (line && line.kind !== 'note') console.log(`    ${line.text}`);
  },
});

console.log(`goal:    ${goal}`);
console.log(`folder:  ${folder}`);
console.log(`model:   ${provider}/${model}`);
console.log(`who:     ${narrator().name}`);

const started = Date.now();
runner.start({ goal, workspace: folder, attachments: require('../src/main/agent/attach').readPaths(given) });
runner.completion
  .then((plan) => {
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`\n[${String(plan.status).toUpperCase()}] ${seconds} s · ${plan.steps.filter((s) => s.status === 'done').length}/${plan.steps.length} steps`);
    if (plan.error) console.log(`error: ${plan.error}`);
    const specDir = path.join(folder, 'specs');
    const features = fs.existsSync(specDir) ? fs.readdirSync(specDir) : [];
    console.log(`specs:   ${features.join(', ') || '(none)'}`);
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.specify' || entry.name === 'specs' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(path.relative(folder, full));
      }
    };
    try { walk(folder); } catch { /* nothing written */ }
    console.log(`files:   ${files.join(', ') || '(none)'}`);
    if (plan.summary) console.log(`\nHer report:\n${plan.summary}`);
    process.exit(plan.status === 'done' ? 0 : 1);
  })
  .catch((err) => {
    console.error('FAIL', err.message);
    process.exit(1);
  });
