'use strict';

// What the harness may touch, and what it may run.
//
// A work order is real work on a real folder: she reads it, writes in it and runs commands in it. All
// of that goes through here first, so the rules live in one place instead of in the hands of a model:
//
//   - files stay inside the folder the work order was given (no `..`, no drive letters of their own,
//     no symlink games: the resolved path has to start with it);
//   - a command is run without a shell, as an argv list, so `&&`, `|`, `>` and `%USERPROFILE%` are
//     never interpreted by anything; the program itself is checked against the autonomy level.
//
// Two levels. 'guard' (the default) lets her run the tools of a project — node, npm, git, python and
// their friends — and refuses anything else. 'trusted' (her menu) lets her run any program except the
// ones that wipe a disk, rewrite the machine's settings or launder a command through another shell.

const path = require('node:path');
const os = require('node:os');

const WIN = process.platform === 'win32';

// The folder a work order runs in when you never picked one.
const defaultWorkspace = () => path.join(os.homedir(), 'Capri Workspace');

// Is `target` inside `root`? (both resolved; `root` itself counts)
function within(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

// A path the model gave, as a path on disk — or why not. `rel` is relative to the workspace.
function resolve(root, rel = '.') {
  const full = path.resolve(root, String(rel ?? '.'));
  if (!within(root, full)) return { ok: false, reason: `"${rel}" is outside the folder of this work order` };
  return { ok: true, path: full };
}

// What she may run in guard mode: the tools a project is made of. Nothing that opens a shell of its
// own (a shell would take any command after it), nothing that installs a service or edits the registry.
const GUARD = new Set([
  'node', 'nodejs', 'npm', 'npx', 'pnpm', 'yarn', 'corepack',
  'git', 'gh',
  'python', 'python3', 'py', 'pip', 'pip3', 'poetry', 'uv', 'pytest', 'ruff', 'black', 'mypy',
  'tsc', 'eslint', 'prettier', 'vite', 'vitest', 'jest', 'tsx',
  'cargo', 'rustc', 'go', 'dotnet', 'java', 'javac', 'gradle', 'mvn',
  'make', 'cmake', 'ninja',
  'ls', 'dir', 'pwd', 'echo', 'type',
  'rg', 'findstr', 'wc', 'head', 'tail', 'tar', 'unzip', 'zip',
]);

// Never, at any level: these wipe a disk, change how the machine boots, or run a command by proxy.
const DENY = new Set([
  'format', 'diskpart', 'bcdedit', 'bootrec', 'cipher', 'vssadmin', 'wbadmin', 'sfc',
  'shutdown', 'restart', 'logoff', 'taskkill', 'reg', 'regedit', 'sc', 'sc.exe', 'netsh',
  'takeown', 'icacls', 'cacls', 'attrib', 'schtasks', 'wmic',
  'powershell', 'powershell.exe', 'pwsh', 'cmd', 'cmd.exe', 'bash', 'sh', 'zsh', 'fish',
  'wscript', 'cscript', 'mshta', 'certutil', 'bitsadmin', 'rundll32', 'regsvr32', 'installutil',
  'sudo', 'su', 'doas', 'runas',
]);

// Arguments that would hand the machine over even through a tool we allow: a print to a device, a
// path that escapes Windows' own name resolution, a recursive delete of a root.
const DENY_ARGS = [
  /--no-preserve-root/i,
  /^[a-z]:[\\/]?\*?$/i,               // a bare drive ("C:" / "C:\") as the object of a command
  /^[\\/]{2}\?[\\/]/,                 // the \\?\ prefix, which skips path checks
  /(^|[\\/])\.\.([\\/]|$){2,}/,        // ../../..
];

const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);

// A command line, as argv, without a shell anywhere near it. Quotes group, backslashes are literal
// (Windows' own paths), and anything unbalanced is refused rather than guessed at.
function parseCommand(text) {
  const source = String(text || '');
  if (!source.trim()) return { ok: false, reason: 'empty command' };
  if (/[\r\n]/.test(source)) return { ok: false, reason: 'one command per call, no line breaks' };
  const argv = [];
  let current = '';
  let quote = null;
  let started = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started || current) { argv.push(current); current = ''; started = false; }
      continue;
    }
    current += ch;
    started = true;
  }
  if (quote) return { ok: false, reason: 'unbalanced quotes' };
  if (started || current) argv.push(current);
  if (!argv.length) return { ok: false, reason: 'empty command' };
  return { ok: true, argv };
}

const binName = (bin) => path.basename(String(bin)).toLowerCase().replace(/\.(exe|cmd|bat|com)$/i, '');

// Would this argv run, at this level? { ok } or { ok: false, reason } — the reason is what her AI is
// told, so it learns the rule instead of trying again blindly.
function checkCommand(text, { autonomy = 'guard' } = {}) {
  const parsed = parseCommand(text);
  if (!parsed.ok) return parsed;
  const { argv } = parsed;
  const bin = binName(argv[0]);
  if (DENY.has(bin)) return { ok: false, reason: `"${bin}" is never run by a work order` };
  for (const arg of argv.slice(1)) {
    if (DENY_ARGS.some((re) => re.test(arg))) return { ok: false, reason: `argument "${arg}" is not allowed` };
  }
  if (autonomy !== 'trusted' && !GUARD.has(bin)) {
    return { ok: false, reason: `"${bin}" is not one of the tools a work order may run (guard mode)` };
  }
  if (autonomy !== 'trusted' && argv.length > 1 && /^-{1,2}(mount|install|service)/i.test(argv[1])) {
    return { ok: false, reason: 'installing something is a click of yours, not a step of a work order' };
  }
  return { ok: true, argv, bin };
}

// A command line as it's shown to you: quoted where it needs to be.
const show = (argv) => argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');

module.exports = {
  WIN, GUARD, DENY, defaultWorkspace, within, resolve, parseCommand, checkCommand, show, words,
};
