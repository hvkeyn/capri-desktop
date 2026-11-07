'use strict';

// A commit that would push something private: an API key, a GitHub token, a private key, or a path with
// somebody's own name in it. Runs from .githooks/pre-commit on the staged files, and by hand on anything:
//
//   node scripts/check-secrets.js               # what is staged
//   node scripts/check-secrets.js src docs      # these files or folders
//   node scripts/check-secrets.js --all         # the whole working tree
//
// Exit 1 and a line per finding. Nothing is sent anywhere: this reads the files you were about to commit.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKIP_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|woff2?|ttf|otf|mp[34]|wav|ogg|zip|7z|rar|gz|tgz|exe|dll|so|dylib|pdf|asar|db|sqlite|bin|dat|psd|blend|fbx|glb|gltf|pyc)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|\.git|\.research)\//;
const MAX = 2 * 1024 * 1024; // a file this big is not a source file we need to read

// What counts, and what is obviously a placeholder rather than a secret.
const RULES = [
  { re: /\bsk-[A-Za-z0-9]{20,}\b/, why: 'an API key (sk-…)' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, why: 'a GitHub token (ghp_/gho_/…)' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, why: 'a GitHub token (github_pat_)' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'an AWS key id' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'a private key' },
  { re: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/, why: 'a Slack token' },
  { re: /C:\\Users\\([A-Za-z0-9._-]+)\\/, why: 'a Windows path with a name in it', allow: (m) => /^(me|user|public|runner|username|yourname)$/i.test(m[1]) },
  { re: /\/home\/([a-z0-9._-]+)\//, why: 'a Unix path with a name in it', allow: (m) => /^(user|me|runner|ubuntu|yourname)$/i.test(m[1]) },
];

// The checker itself and its test quote these patterns on purpose.
const ALLOW_FILES = new Set(['scripts/check-secrets.js', 'tests/secrets.test.js']);

function listStaged() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function listFolder(target) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (SKIP_PATH.test(`${full}/`)) continue;
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(target);
  return out;
}

function listAll() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name === '.research') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(process.cwd());
  return out;
}

function scanFile(file, rel = file) {
  if (SKIP_PATH.test(`${rel}/`) || SKIP_EXT.test(rel) || ALLOW_FILES.has(rel)) return [];
  let text;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX) return [];
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  if (text.includes('\u0000')) return []; // binary
  const found = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // a path written in code has its backslashes doubled ("C:\\\\Users\\\\…"): look at it both ways
    const variants = lines[i].includes('\\\\') ? [lines[i], lines[i].replace(/\\\\/g, '\\')] : [lines[i]];
    for (const rule of RULES) {
      let hit = null;
      for (const line of variants) {
        const m = rule.re.exec(line);
        if (!m) continue;
        if (rule.allow && rule.allow(m)) continue;
        hit = m;
        break;
      }
      if (hit) found.push({ file: rel, line: i + 1, why: rule.why, sample: String(hit[0]).slice(0, 24) });
    }
  }
  return found;
}

function main(argv = process.argv.slice(2)) {
  let files;
  if (argv.includes('--all')) files = listAll().map((f) => ({ file: f, rel: path.relative(process.cwd(), f).split(path.sep).join('/') }));
  else if (argv.length) {
    files = [];
    for (const target of argv) {
      if (!fs.existsSync(target)) continue;
      if (fs.statSync(target).isDirectory()) {
        for (const f of listFolder(target)) files.push({ file: f, rel: path.relative(process.cwd(), f).split(path.sep).join('/') });
      } else {
        files.push({ file: target, rel: target.split(path.sep).join('/') });
      }
    }
  } else {
    files = listStaged().map((f) => ({ file: f, rel: f }));
  }

  const findings = files.flatMap(({ file, rel }) => scanFile(file, rel));
  if (!findings.length) {
    console.log(`secrets: nothing in ${files.length} file${files.length === 1 ? '' : 's'}`);
    return 0;
  }
  console.error('secrets: this commit would carry something private:');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.why}  (${f.sample}…)`);
  console.error('');
  console.error('Take it out of the file and stage it again. If it is a placeholder, make it look like one');
  console.error('(sk-… rather than a real key), or add the file to ALLOW_FILES in scripts/check-secrets.js.');
  return 1;
}

module.exports = { main, scanFile, RULES, ALLOW_FILES, listStaged };

if (require.main === module) process.exit(main());
