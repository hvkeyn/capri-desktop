// What she is doing, in two words: the verb the panel shows while a tool runs, and the colour and face
// that go with it. It is the difference between "she is thinking" and "she is running a command", which
// is exactly what a thin panel has to say without a paragraph.
//
// A tool call arrives as { name, arguments }; this turns it into { verb, target, activity }. No DOM, no
// side effects: the panel draws it, this only decides what "it" is.

const BY_TOOL = {
  system_info: { verb: 'CHECKS', activity: 'think', from: (a) => a.section || 'the machine' },
  open_apps: { verb: 'LOOKS', activity: 'think', from: () => 'open windows' },
  find_files: { verb: 'SEARCHES', activity: 'search', from: (a) => a.name || 'files' },
  launch_folder: { verb: 'LOCATES', activity: 'think', from: () => 'her own folder' },
  list_dir: { verb: 'LISTS', activity: 'read', from: (a) => a.path || 'the home folder' },
  read_file: { verb: 'READS', activity: 'read', from: (a) => a.path || 'a file' },
  search_files: { verb: 'GREPS', activity: 'search', from: (a) => a.pattern || 'text' },
  run_command: { verb: 'RUNS', activity: 'run', from: (a) => a.command || 'a command' },
  write_file: { verb: 'WRITES', activity: 'write', from: (a) => a.path || 'a file' },
  patch_file: { verb: 'PATCHES', activity: 'write', from: (a) => a.path || 'a file' },
  update_plan: { verb: 'DECIDES', activity: 'think', from: (a) => a.status || 'the step' },
};

export const short = (text, max = 48) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

// The face she wears while doing it: a look down at the work, a grin when it lands, a flinch when not.
const FACE = {
  think: 'aside', read: 'calm', search: 'look', run: 'calm', write: 'smug', wait: 'aside', error: 'laugh',
};

export function describe(name, args = {}) {
  const tool = BY_TOOL[name];
  const a = args && typeof args === 'object' ? args : {};
  if (!tool) return { verb: 'USES', target: short(name || 'a tool'), activity: 'think' };
  let target = '';
  try {
    target = short(tool.from(a));
  } catch {
    target = '';
  }
  return { verb: tool.verb, target, activity: tool.activity };
}

// What she is doing before anything has happened yet: the wait before the first token, which used to be
// a blinking bar and nothing else.
export const WAITING = {
  think: { verb: 'THINKS', target: 'about it', activity: 'wait' },
  read: { verb: 'READS', target: 'the room', activity: 'wait' },
};

export { FACE, BY_TOOL };
