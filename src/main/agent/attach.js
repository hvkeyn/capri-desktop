'use strict';

// What you hand her: files you picked, files you dropped on the board, files (and text) that were on
// the clipboard, and pictures, which she can only understand if the model behind her can see.
//
// Everything becomes a context block at the front of the work order and a copy inside
// `specs/NNN-slug/attachments/`, so her model can read it once by itself and again, file by file, with
// read_file if it needs more. Nothing here talks to a model: the vision pass lives in main.js, which is
// the only place that knows the provider; this file only knows what a file is.

const fs = require('node:fs');
const path = require('node:path');

const TEXT_MAX = 200 * 1024;     // one text file, read whole, in bytes
const CONTEXT_MAX = 24 * 1024;   // what one file may put into the prompt, in characters
const TOTAL_CONTEXT = 90 * 1024; // and all of them together
const IMAGE_MAX = 12 * 1024 * 1024;

const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
const SKIP = { '.exe': 'a program', '.dll': 'a library', '.zip': 'an archive', '.7z': 'an archive', '.rar': 'an archive', '.gz': 'an archive', '.mp4': 'a video', '.mp3': 'audio', '.wav': 'audio', '.pdf': 'a PDF', '.docx': 'a Word file', '.xlsx': 'a spreadsheet', '.pptx': 'a deck', '.psd': 'a Photoshop file', '.blend': 'a Blender file' };

const kb = (n) => `${Math.round(n / 1024)} KB`;

const isBinary = (buf) => buf.subarray(0, 8192).includes(0);

// One file, as an attachment: its text, or that it is a picture (with the bytes for the vision pass),
// or that it is something only a human can open.
function readFile(file, { max = TEXT_MAX } = {}) {
  const name = path.basename(String(file || ''));
  const ext = path.extname(name).toLowerCase();
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { ok: false, name, error: 'no such file' };
  }
  if (stat.isDirectory()) return { ok: false, name, error: 'is a folder, not a file' };
  if (stat.size > IMAGE_MAX) return { ok: false, name, error: `${kb(stat.size)} is too big to hand over` };

  if (IMAGES[ext]) {
    return { ok: true, kind: 'image', name, path: file, bytes: stat.size, mime: IMAGES[ext] };
  }
  if (SKIP[ext]) {
    return { ok: true, kind: 'binary', name, path: file, bytes: stat.size, note: `${SKIP[ext]}, not read` };
  }
  if (stat.size > max) return { ok: true, kind: 'binary', name, path: file, bytes: stat.size, note: `${kb(stat.size)}, too big to put in the prompt` };

  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (err) {
    return { ok: false, name, error: err.message };
  }
  if (isBinary(buf)) {
    return { ok: true, kind: 'binary', name, path: file, bytes: stat.size, note: 'a binary file, not read' };
  }
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  return { ok: true, kind: 'text', name, path: file, bytes: stat.size, text };
}

// A list of paths (a picker, a drop, the clipboard's file list) as attachments, in order, with the ones
// that couldn't be read named instead of silently dropped.
function readPaths(paths = []) {
  const out = [];
  for (const file of paths) {
    const one = readFile(file);
    if (one.ok) out.push(one);
    else out.push({ kind: 'skipped', name: one.name || String(file), error: one.error });
  }
  return out;
}

// Text that was on the clipboard, as an attachment — bounded, because a clipboard can hold a whole
// document and the prompt is not a hard drive.
function fromText(text, name = 'clipboard.txt') {
  const body = String(text || '');
  if (!body.trim()) return null;
  const cut = body.length > CONTEXT_MAX ? `${body.slice(0, CONTEXT_MAX)}\n… (cut: ${body.length} characters on the clipboard)` : body;
  return { kind: 'text', name, text: cut, bytes: Buffer.byteLength(body), from: 'clipboard' };
}

// The block her model reads at the start of a work order: what each file is, what it says, and where
// the copy lives if it wants to read it in full.
function contextBlock(attachments, files = []) {
  if (!attachments.length) return '';
  const lines = ['## What was handed to you with this work order', ''];
  let budget = TOTAL_CONTEXT;
  for (const item of attachments) {
    const size = item.bytes ? `${kb(item.bytes)}` : '';
    const copy = files.find((f) => f.name === item.name);
    if (item.kind === 'text') {
      const body = String(item.text || '');
      const room = Math.max(0, Math.min(CONTEXT_MAX, budget));
      const shown = body.length > room ? `${body.slice(0, room)}\n… (cut, ${body.length} characters in all)` : body;
      budget -= Math.min(body.length, room);
      lines.push(`### ${item.name} (text${size ? `, ${size}` : ''}${item.from === 'clipboard' ? ', from the clipboard' : ''})`);
      lines.push('```', shown.replace(/```/g, '``'), '```');
      if (copy) lines.push(`The whole file is at \`${copy.inFolder}\`.`);
    } else if (item.kind === 'image') {
      lines.push(`### ${item.name} (picture${size ? `, ${size}` : ''})`);
      lines.push(item.description
        ? `What it shows: ${item.description}`
        : 'A picture, and the model behind you could not look at it. Say so if the work depends on it.');
      if (copy) lines.push(`The picture itself is at \`${copy.inFolder}\`.`);
    } else {
      lines.push(`### ${item.name} (${item.note || 'not read'})`);
      if (item.error) lines.push(`Could not be read: ${item.error}.`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Copies of everything into the feature folder, and the paths her model may open with read_file. The
// paths are relative to the folder of the work order — that is what read_file takes — not to the
// feature folder they happen to live in.
function prepare(dir, attachments = [], root = dir) {
  const folder = path.join(dir, 'attachments');
  const files = [];
  for (const item of attachments) {
    const safe = String(item.name || 'file').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'file';
    const full = path.join(folder, safe);
    const inFolder = path.relative(root, full).split(path.sep).join('/');
    try {
      fs.mkdirSync(folder, { recursive: true });
      if (item.kind === 'text') fs.writeFileSync(full, String(item.text || ''));
      else if (item.kind === 'image' && item.path) fs.copyFileSync(item.path, full);
      files.push({ name: item.name, inFolder });
    } catch {
      // a copy that couldn't be written is one she can't re-read later; the context block still has it
    }
  }
  const context = contextBlock(attachments, files);
  if (context) {
    try {
      fs.writeFileSync(path.join(dir, 'attachments.md'), `${context}\n`);
    } catch { /* the prompt still carries it */ }
  }
  return { files, context, folder: path.relative(root, path.join(dir, 'attachments.md')).split(path.sep).join('/') };
}

module.exports = { readFile, readPaths, fromText, contextBlock, prepare, IMAGES, TEXT_MAX };
