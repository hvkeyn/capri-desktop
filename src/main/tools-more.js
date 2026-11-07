'use strict';

// Tools that grow: a page off the web, one call that looks at everything and says what is wrong, and the
// tools the user writes themselves in harness/tools.json — a command with {placeholders}, run through the
// same guard and the same level as every other command.
//
// tools.js owns the built-ins and hands this module what it needs (systemInfo, runCommand) through
// attach(); keeping the dependency that way round means no circular require and a module that can be
// tested on its own.

let deps = { systemInfo: null, runCommand: null };
function attach(next = {}) {
  deps = { ...deps, ...next };
  return deps;
}

async function webFetch(url, { fetchImpl = globalThis.fetch, timeout = 20000 } = {}) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) return { error: 'only http(s) addresses' };
  try {
    const res = await fetchImpl(target, {
      headers: { 'user-agent': 'Capri/1.0' },
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
    });
    const raw = await res.text();
    const title = (/<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(raw) || [])[1];
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      ok: res.ok,
      status: res.status,
      url: target,
      title: title ? title.trim() : null,
      text: text.slice(0, 20000),
      ...(text.length > 20000 ? { more: true } : {}),
    };
  } catch (err) {
    return { error: err.message || 'the page could not be read' };
  }
}

// What is wrong, from what the machine says: a pure function, so the thresholds can be tested.
function findings(info = {}) {
  const out = [];
  const disk = info.disk;
  if (disk && disk.total) {
    const share = disk.free / disk.total;
    if (share < 0.05) out.push({ level: 'bad', text: `disc ${disk.drive}: only ${disk.free} of ${disk.total} GB free` });
    else if (share < 0.1) out.push({ level: 'warn', text: `disc ${disk.drive}: ${disk.free} of ${disk.total} GB free` });
  }
  if (info.memory && info.memory.total) {
    const used = info.memory.used / info.memory.total;
    if (used >= 0.85) out.push({ level: 'warn', text: `memory: ${Math.round(used * 100)}% used (${info.memory.used} of ${info.memory.total} GB)` });
  }
  if (info.cpu && Number(info.cpu.load) >= 90) out.push({ level: 'warn', text: `processor at ${info.cpu.load}%` });
  const t = info.temperature || {};
  if (t.cpu >= 90) out.push({ level: 'bad', text: `cpu zone at ${t.cpu} °C` });
  if (t.gpu && t.gpu.celsius >= 85) out.push({ level: 'warn', text: `gpu at ${t.gpu.celsius} °C` });
  if (t.note) out.push({ level: 'info', text: t.note });
  if (info.battery && info.battery.none === false && info.battery.percent <= 15) out.push({ level: 'warn', text: `battery ${info.battery.percent}%` });
  return out;
}

async function diagnose() {
  if (!deps.systemInfo) return { error: 'not wired up' };
  const info = await deps.systemInfo('all');
  return {
    report: {
      cpu: info.cpu,
      memory: info.memory,
      disk: info.disk,
      temperature: info.temperature,
      devices: info.devices,
      battery: info.battery,
      uptimeMinutes: info.uptimeMinutes,
    },
    findings: findings(info),
    heaviest: (info.processes || []).slice(0, 5).map((p) => p.name),
    checked: ['processor load', 'memory', 'disk', 'temperature', 'devices', 'heaviest programs'],
  };
}

// The tools the user writes.
let CUSTOM = [];
function loadCustom(list) {
  CUSTOM = (Array.isArray(list) ? list : []).filter((tool) => tool && !tool.disabled
    && typeof tool.name === 'string' && typeof tool.command === 'string' && tool.command.trim()
    && !CUSTOM.some((existing) => existing.name === tool.name));
  return CUSTOM.length;
}

const schemas = () => CUSTOM.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description || `the user's own tool: ${tool.name}`,
    parameters: tool.parameters || { type: 'object', properties: {}, required: [] },
  },
}));

const fillCommand = (template, args = {}) => String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
  const value = args && typeof args === 'object' ? args[key] : '';
  return value === undefined || value === null ? '' : String(value);
});

async function run(name, args, ctx) {
  if (name === 'web_fetch') return webFetch(args?.url);
  if (name === 'diagnose') return diagnose();
  const tool = CUSTOM.find((t) => t.name === name);
  if (!tool || !deps.runCommand) return null;
  const out = await deps.runCommand(fillCommand(tool.command, args), tool.cwd, {
    ...ctx,
    autonomy: tool.autonomy === 'full' ? 'full' : ctx.autonomy,
  });
  return { tool: name, ...out };
}

module.exports = { attach, webFetch, findings, diagnose, loadCustom, schemas, fillCommand, run, CUSTOM: () => CUSTOM };
