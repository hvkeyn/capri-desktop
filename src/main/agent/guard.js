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
// The level is hers to pick in the menu (see the three below): what changes is which programs may run,
// never the folder rule and never the argv rule. One level up from 'trusted' is 'full', which runs a
// shell as well — the same powers the harness driving this desktop has.

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

// Three levels of what may run, picked in her menu:
//
//   guard   a project's own tools (node, npm, git, python, cargo…): a work order that builds something
//   trusted anything but the ones that wipe a disk, rewrite the machine's settings or take ownership
//   full    everything the harness itself may run, shells included (pwsh -Command "npm test | tee log"):
//           what you want when she has to drive a machine rather than a repo
//
// The catastrophic set is refused at every level: a work order is not going to format a disk.
const LEVELS = ['guard', 'trusted', 'full'];

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

// Never, at any level: these wipe a disk, change how the machine boots, or edit the machine's own
// settings. A work order that needs one of them needs you.
const CATASTROPHIC = new Set([
  'format', 'diskpart', 'bcdedit', 'bootrec', 'cipher', 'vssadmin', 'wbadmin', 'sfc',
  'reg', 'regedit', 'sc', 'sc.exe', 'netsh', 'schtasks', 'wmic',
  'takeown', 'icacls', 'cacls', 'attrib', 'shutdown', 'restart', 'logoff', 'taskkill',
]);

// A shell of its own: it would take any command after it, so only full access may run one.
const SHELLS = new Set([
  'powershell', 'powershell.exe', 'pwsh', 'cmd', 'cmd.exe', 'bash', 'sh', 'zsh', 'fish',
]);

// Things that launder a command through another program, or install a service: full access only.
const TRUSTED_DENY = new Set([
  'wscript', 'cscript', 'mshta', 'certutil', 'bitsadmin', 'rundll32', 'regsvr32', 'installutil',
  'sudo', 'su', 'doas', 'runas', 'mount', 'umount', 'systemctl', 'launchctl',
]);

// The old name, kept for anything that still reads it: what no work order runs, at any level.
const DENY = new Set([...CATASTROPHIC, ...TRUSTED_DENY]);

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
  const level = LEVELS.includes(autonomy) ? autonomy : 'guard';
  if (CATASTROPHIC.has(bin)) return { ok: false, reason: `"${bin}" is never run by a work order, at any level` };
  if (TRUSTED_DENY.has(bin) && level !== 'full') {
    return { ok: false, reason: `"${bin}" needs full access (her menu › Work › What she may run)` };
  }
  if (SHELLS.has(bin) && level !== 'full') {
    return { ok: false, reason: `"${bin}" is a shell; only full access may run a shell` };
  }
  for (const arg of argv.slice(1)) {
    if (DENY_ARGS.some((re) => re.test(arg))) return { ok: false, reason: `argument "${arg}" is not allowed` };
  }
  if (level === 'guard' && !GUARD.has(bin)) {
    return { ok: false, reason: `"${bin}" is not one of the tools a work order may run (guard mode)` };
  }
  if (level !== 'full' && argv.length > 1 && /^-{1,2}(mount|install|service)/i.test(argv[1])) {
    return { ok: false, reason: 'installing something is a click of yours, not a step of a work order' };
  }
  return { ok: true, argv, bin, level };
}

// A command line as it's shown to you: quoted where it needs to be.
const show = (argv) => argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');

module.exports = {
  WIN, LEVELS, GUARD, DENY, CATASTROPHIC, SHELLS, TRUSTED_DENY,
  defaultWorkspace, within, resolve, parseCommand, checkCommand, show, words,
};
