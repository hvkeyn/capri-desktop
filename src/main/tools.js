'use strict';

// What her AI may look at on this PC, and what it may run on it, offered to it as tools (OpenAI-style
// function calling): the machine's hardware and how hard it works, what's open on it, files by name,
// folders and files by path, a search, and a command line. The commands go through agent/guard.js at
// the level in her menu (full by default: a shell too), so a chat that used to answer "I can't" now
// does it — and a refusal is a sentence the model reads, not a silent no.
//
// Windows gets the real thing (WMI through PowerShell); elsewhere the same shape from Node.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const apps = require('./apps');
const guard = require('./agent/guard');
const exec = require('./agent/exec');

const WIN = process.platform === 'win32';
const GB = (bytes) => Math.round((bytes / 1024 ** 3) * 10) / 10;

const ps = (script, timeout = 12000) => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${script}`],
    { windowsHide: true, timeout }, (err, out) => (err ? reject(err) : resolve(out.trim())));
});

const json = (text) => {
  try { return JSON.parse(text); } catch { return null; }
};

// The tool cards her AI reads. Kept short: they're sent with every message of the conversation.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'system_info',
      description: "Look at the user's PC: processor, graphics card, memory, disks and what is free, battery, network, Windows itself, the programs using it hardest, the temperatures the machine reports, and the devices it has (displays, sound, USB). Use it instead of guessing or saying you can't see the machine.",
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['all', 'cpu', 'gpu', 'memory', 'disk', 'battery', 'network', 'os', 'processes', 'temperature', 'devices'],
            description: "'all' gives a quick overview.",
          },
        },
        required: ['section'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_apps',
      description: 'The programs open on their desktop right now.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_files',
      description: "Find files in the user's home folder by part of their name ('resume', '.psd', 'invoice').",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'part of the file name' },
          limit: { type: 'integer', description: 'how many, 1 to 20 (default 8)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'launch_folder',
      description: 'Where you are installed and where your process was started from, plus this PC\'s folder and the level you may run things at. Use it instead of guessing where "your folder" is.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: "List a folder on this PC. A path starting with ~ is the user's home; at full access an absolute path anywhere is fine, otherwise the home folder and below.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'folder; default is the home folder' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file: the source the user means, a log, a config. Read before you change anything, and never guess at a file you can open.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'file, ~ allowed, absolute at full access' },
          offset: { type: 'integer', description: 'byte to start at (default 0), for the rest of a long file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Find text in files under a folder: every matching line with its file and line number. Plain text, or /a regex/ between slashes.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'folder to search under (default: the home folder)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: "Run a command on this PC and read what it printed: the shell at full access, a project's own tools below that. The level in the user's menu decides what is allowed; a refusal says why and is a rule, not an obstacle.",
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'e.g. "dir C:\\Projects" or "git status --short" — no shell tricks unless running a shell' },
          cwd: { type: 'string', description: 'folder to run it in (default: the working folder)' },
        },
        required: ['command'],
      },
    },
  },
];

// How hard the processor works, sampled over a moment (Node's own counters: no PowerShell needed)
async function cpuLoad(ms = 350) {
  const snap = () => os.cpus().map(({ times: t }) => ({ idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }));
  const before = snap();
  await new Promise((r) => setTimeout(r, ms));
  const after = snap();
  let idle = 0;
  let total = 0;
  after.forEach((c, i) => {
    idle += c.idle - (before[i]?.idle || 0);
    total += c.total - (before[i]?.total || 0);
  });
  return total > 0 ? Math.round(100 * (1 - idle / total)) : null;
}

async function cpu() {
  const load = await cpuLoad();
  return {
    model: (os.cpus()[0]?.model || 'unknown').replace(/\s+/g, ' ').trim(),
    cores: os.cpus().length,
    load,
  };
}

async function gpu() {
  if (!WIN) return null;
  const out = await ps('Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress').catch(() => '');
  const rows = [].concat(json(out) || []);
  return rows.map((g) => ({ name: g.Name, memory: g.AdapterRAM ? GB(g.AdapterRAM) : null, driver: g.DriverVersion }));
}

function disk() {
  const drive = `${process.env.SystemDrive || 'C:'}\\`;
  try {
    const s = fs.statfsSync(drive);
    return { drive: drive.slice(0, 2), free: GB(s.bavail * s.bsize), total: GB(s.blocks * s.bsize) };
  } catch {
    return null;
  }
}

async function battery() {
  if (!WIN) return null;
  const out = await ps('Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress').catch(() => '');
  const b = json(out);
  if (!b) return { none: true };
  return { percent: b.EstimatedChargeRemaining, charging: [2, 3, 6, 7, 8, 9].includes(b.BatteryStatus) };
}

function network() {
  const list = Object.entries(os.networkInterfaces())
    .filter(([name]) => !/virtual|vethernet|vmware|loopback|vbox|wsl|hyper-v/i.test(name))
    .flatMap(([name, addrs]) => (addrs || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })));
  return list.slice(0, 4);
}

async function windowsVersion() {
  if (!WIN) return { platform: `${os.type()} ${os.release()}`, arch: os.arch() };
  const out = await ps('Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber | ConvertTo-Json -Compress').catch(() => '');
  const o = json(out);
  return { name: o?.Caption || `${os.type()} ${os.release()}`, version: o?.Version || os.release(), build: o?.BuildNumber || null, arch: os.arch() };
}

async function processes() {
  if (!WIN) return [];
  const out = await ps('Get-Process | Sort-Object -Descending WorkingSet64 | Select-Object -First 8 Name,@{n="MB";e={[int]($_.WorkingSet64/1MB)}},@{n="cpuSeconds";e={[int]$_.CPU}} | ConvertTo-Json -Compress').catch(() => '');
  return [].concat(json(out) || []).map((p) => ({ name: p.Name, memoryMB: p.MB, cpuSeconds: p.cpuSeconds }));
}

// The temperatures the machine actually reports. Windows exposes thermal zones through WMI (tenths of a
// Kelvin, ACPI), and a GeForce card answers nvidia-smi directly. A desktop with none of it says so instead
// of leaving "temperature" out: "no sensor" is an answer, a missing key is a guess.
async function temperature() {
  const out = { cpu: null, gpu: null, sources: [], note: null };
  if (!WIN) return { ...out, note: `no sensor here (${os.type()})` };
  const zones = await ps(
    'Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue '
    + '| Select-Object -First 4 InstanceName,CurrentTemperature | ConvertTo-Json -Compress',
    10000,
  ).catch(() => '');
  const rows = [].concat(json(zones) || []);
  const hot = rows.map((r) => Math.round((Number(r.CurrentTemperature) / 10 - 273.15) * 10) / 10).filter((n) => Number.isFinite(n) && n > -40 && n < 150);
  if (hot.length) {
    out.cpu = Math.max(...hot);
    out.sources.push('ACPI thermal zone');
  }
  const gpuTemp = await new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=temperature.gpu,utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 6000 },
      (err, stdout) => resolve(err ? '' : String(stdout).trim()));
  }).catch(() => '');
  const line = String(gpuTemp || '').split('\n')[0].trim();
  if (line) {
    const [c, load] = line.split(',').map((v) => Number(String(v).trim()));
    if (Number.isFinite(c)) {
      out.gpu = { celsius: c, load: Number.isFinite(load) ? load : null };
      out.sources.push('nvidia-smi');
    }
  }
  if (out.cpu === null && !out.gpu) out.note = 'this machine reports no temperature to Windows (no ACPI thermal zone, no nvidia-smi); say so, do not guess';
  return out;
}

// What is plugged into the box: displays, sound devices, USB hubs. Enough to answer "что за устройства".
async function devices() {
  if (!WIN) return { note: `device list is Windows-only (${os.type()})` };
  const read = async (script) => [].concat(json(await ps(script, 12000).catch(() => '')) || []);
  const displays = await read('Get-CimInstance Win32_DesktopMonitor | Select-Object -First 6 Name,ScreenWidth,ScreenHeight | ConvertTo-Json -Compress');
  const sound = await read('Get-CimInstance Win32_SoundDevice | Select-Object -First 6 Name | ConvertTo-Json -Compress');
  const usb = await read('Get-CimInstance Win32_USBHub | Select-Object -First 8 Name,Status | ConvertTo-Json -Compress');
  return {
    displays: displays.map((m) => ({ name: m.Name, width: m.ScreenWidth, height: m.ScreenHeight })),
    sound: sound.map((s) => s.Name).filter(Boolean),
    usb: usb.map((u) => ({ name: u.Name, status: u.Status })).filter((u) => u.name),
  };
}

async function systemInfo(section = 'all') {
  const want = (part) => section === 'all' || section === part;
  const out = {};
  if (want('os')) out.os = await windowsVersion();
  if (want('cpu')) out.cpu = await cpu();
  if (want('gpu')) out.gpu = await gpu();
  if (want('memory')) out.memory = { used: GB(os.totalmem() - os.freemem()), total: GB(os.totalmem()) };
  if (want('disk')) out.disk = disk();
  if (want('battery')) out.battery = await battery();
  if (want('network')) out.network = network();
  if (want('processes')) out.processes = await processes();
  if (want('temperature')) out.temperature = await temperature();
  if (want('devices')) out.devices = await devices();
  if (!Object.keys(out).length) return { error: `unknown section "${section}"` };
  out.uptimeMinutes = Math.round(os.uptime() / 60);
  return out;
}

async function openApps() {
  const list = await apps.list().catch(() => []);
  return list.slice(0, 20).map((a) => ({ name: a.name, window: a.label || null }));
}

async function findFiles(name, limit = 8) {
  const key = String(name || '').trim();
  if (key.length < 2) return { error: 'give at least two characters of the name' };
  const count = Math.max(1, Math.min(20, Number(limit) || 8));
  const safe = key.replace(/['`"\\]/g, '');
  if (!WIN) return { error: 'only on Windows' };
  const home = os.homedir();
  const out = await ps(
    `Get-ChildItem -Path '${home.replace(/'/g, "''")}' -Recurse -Depth 5 -File -Filter '*${safe}*' -ErrorAction SilentlyContinue `
    + `| Sort-Object LastWriteTime -Descending | Select-Object -First ${count} FullName,@{n="KB";e={[int]($_.Length/1KB)}},LastWriteTime `
    + '| ConvertTo-Json -Compress',
    15000,
  ).catch(() => '');
  const rows = [].concat(json(out) || []);
  return rows.map((f) => ({ path: f.FullName, kb: f.KB }));
}

// One way in, from her chat (main.js): a tool's name, the arguments her AI gave for it, and where she
// is allowed to work. Everything that reads lives here; everything that runs goes through agent/guard
// and agent/exec, at the level in her menu — so a chat that used to say "I can't" now does it, and a
// command that is refused says so in words the model can read.
async function run(name, args = {}, ctx = {}) {
  const a = args && typeof args === 'object' ? args : {};
  switch (name) {
    case 'system_info': return systemInfo(String(a.section || 'all'));
    case 'open_apps': return openApps();
    case 'find_files': return findFiles(a.name, a.limit);
    case 'launch_folder': return launchFolder(ctx);
    case 'list_dir': return listFolder(a.path, ctx);
    case 'read_file': return readFileContent(a.path, a.offset, ctx);
    case 'search_files': return searchInFolder(a.pattern, a.path, ctx);
    case 'run_command': return runCommand(a.command, a.cwd, ctx);
    default: return { error: `no such tool: ${name}` };
  }
}

// ---- reading and running, from her chat ------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor', '.venv', 'venv', '__pycache__', 'AppData']);
const BINARY = /\.(png|jpe?g|gif|webp|bmp|ico|woff2?|ttf|otf|mp[34]|wav|ogg|zip|7z|rar|gz|tgz|exe|dll|so|dylib|pdf|asar|db|sqlite|bin|dat|psd|blend|fbx|glb|gltf)$/i;
const READ_CAP = 160 * 1024;
const LIST_CAP = 200;
const HIT_CAP = 80;

const chatRoot = (ctx) => path.resolve(ctx.root || ctx.home || os.homedir());

// A path the model gave: `~` for home, relative to the working folder, and absolute anywhere only at
// full access (a read is harmless, but a chat shouldn't be talked into poking around at `guard`).
function chatPath(input, ctx) {
  const raw = String(input ?? '').trim() || '.';
  const home = ctx.home || os.homedir();
  let want = raw;
  if (want === '~') want = home;
  else if (want.startsWith('~/') || want.startsWith('~\\')) want = path.join(home, want.slice(2));
  const root = chatRoot(ctx);
  const full = path.resolve(root, want);
  if (ctx.autonomy !== 'full' && !guard.within(home, full) && !guard.within(root, full)) {
    return { error: `"${raw}" is outside your home folder; full access (her menu › Work) reads anywhere` };
  }
  return { path: full };
}

function launchFolder(ctx) {
  return {
    app: ctx.appRoot || null,
    executable: process.execPath,
    startedIn: process.cwd(),
    home: ctx.home || os.homedir(),
    workingFolder: chatRoot(ctx),
    level: ctx.autonomy || 'guard',
  };
}

function listFolder(where, ctx) {
  const at = chatPath(where || '.', ctx);
  if (at.error) return { error: at.error };
  let entries;
  try {
    entries = fs.readdirSync(at.path, { withFileTypes: true });
  } catch (err) {
    return { error: `cannot read that folder: ${err.code || err.message}` };
  }
  const rows = entries.slice(0, LIST_CAP).map((e) => {
    let bytes = null;
    try { bytes = e.isFile() ? fs.statSync(path.join(at.path, e.name)).size : null; } catch { /* gone */ }
    return { name: e.name, dir: e.isDirectory(), bytes };
  });
  return { path: at.path, entries: rows, ...(entries.length > rows.length ? { more: true } : {}) };
}

function readFileContent(where, offset = 0, ctx = {}) {
  const at = chatPath(where, ctx);
  if (at.error) return { error: at.error };
  let stat;
  try {
    stat = fs.statSync(at.path);
  } catch {
    return { error: `no such file: ${where}` };
  }
  if (!stat.isFile()) return { error: `not a file: ${where}` };
  if (BINARY.test(at.path)) return { error: `${where} is binary; only text can be read` };
  if (stat.size > 8 * 1024 * 1024) return { error: `${Math.round(stat.size / 1024)} KB is too big to read at once` };
  const start = Math.max(0, Number(offset) || 0);
  const fd = fs.openSync(at.path, 'r');
  try {
    const length = Math.min(READ_CAP, Math.max(0, stat.size - start));
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, start);
    const clipped = start + length < stat.size;
    return { path: at.path, bytes: stat.size, text: buf.toString('utf8'), ...(clipped ? { more: true, nextOffset: start + length } : {}) };
  } finally {
    fs.closeSync(fd);
  }
}

function searchInFolder(pattern, where, ctx) {
  const at = chatPath(where || '.', ctx);
  if (at.error) return { error: at.error };
  const source = String(pattern || '');
  if (!source) return { error: 'nothing to search for' };
  let test = null;
  if (/^\/.*\/[gimsuy]*$/.test(source)) {
    try {
      test = new RegExp(source.slice(1, source.lastIndexOf('/')), source.slice(source.lastIndexOf('/') + 1));
    } catch {
      return { error: 'that is not a valid pattern' };
    }
  }
  const hits = [];
  let walked = 0;
  const walk = (dir) => {
    if (hits.length >= HIT_CAP || walked > 3000) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= HIT_CAP) return;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
        continue;
      }
      if (SKIP_DIRS.has(e.name) || BINARY.test(e.name)) continue;
      walked += 1;
      let text;
      try {
        const size = fs.statSync(path.join(dir, e.name)).size;
        if (size > READ_CAP) continue;
        text = fs.readFileSync(path.join(dir, e.name), 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hit = test ? test.test(line) : line.toLowerCase().includes(source.toLowerCase());
        if (test) test.lastIndex = 0;
        if (!hit) continue;
        hits.push({ file: path.relative(at.path, path.join(dir, e.name)), line: i + 1, text: line.trim().slice(0, 200) });
        if (hits.length >= HIT_CAP) break;
      }
    }
  };
  walk(at.path);
  return { pattern: source, in: at.path, hits, ...(hits.length >= HIT_CAP ? { more: true } : {}) };
}

async function runCommand(command, cwd, ctx = {}) {
  const text = String(command || '').trim();
  if (!text) return { error: 'empty command' };
  const where = cwd ? chatPath(cwd, ctx) : { path: chatRoot(ctx) };
  if (where.error) return { error: where.error };
  const out = await exec.run(text, { root: where.path, autonomy: ctx.autonomy || 'guard' });
  // what a model needs is the tail: a failing build says why at the end of stderr, not at the start
  return {
    ok: out.ok,
    command: out.command || text,
    exit: out.ok ? 0 : (out.code ?? null),
    ms: out.ms || 0,
    out: out.out || '',
    stderr: out.stderr || '',
    ...(out.error ? { error: out.error } : {}),
  };
}

module.exports = { TOOLS, run, systemInfo, openApps, findFiles, launchFolder, listFolder, readFileContent, searchInFolder, runCommand, temperature, devices };
