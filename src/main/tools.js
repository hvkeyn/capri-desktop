'use strict';

// What her AI may look at on this PC, offered to it as tools (OpenAI-style function calling): the
// machine's hardware and how hard it works, what's open on it, and files by name. Read only, all of
// it, so her AI can call them by itself, without a click. Anything that *changes* the PC stays in
// her chat's own hands (chat.js), where it already has its buttons.
//
// Windows gets the real thing (WMI through PowerShell); elsewhere the same shape from Node.

const os = require('node:os');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const apps = require('./apps');

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
      description: "Look at the user's PC: processor, graphics card, memory, disks, battery, network, Windows itself, or the programs using it hardest. Use it instead of guessing or saying you can't see the machine.",
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['all', 'cpu', 'gpu', 'memory', 'disk', 'battery', 'network', 'os', 'processes'],
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

// One way in, from her chat (main.js): a tool's name and the arguments her AI gave for it.
async function run(name, args = {}) {
  const a = args && typeof args === 'object' ? args : {};
  switch (name) {
    case 'system_info': return systemInfo(String(a.section || 'all'));
    case 'open_apps': return openApps();
    case 'find_files': return findFiles(a.name, a.limit);
    default: return { error: `no such tool: ${name}` };
  }
}

module.exports = { TOOLS, run, systemInfo, openApps, findFiles };
