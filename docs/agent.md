# The harness: her working half

Up to 0.5.1 Capri could look at your PC, and talk about it. She couldn't *do* anything with it: her
chat's tools were read-only (`src/main/tools.js`), and anything that changed something was a button
you pressed yourself. This is the other half — a work order: a sentence, a folder, and five phases that
end with a report — and the board that shows it while it happens.

Two references shaped it:

- **[github/spec-kit](https://github.com/github/spec-kit)** — spec before plan, plan before tasks,
  tasks before a line of code. The artifacts it writes (`constitution.md`, `spec.md`, `plan.md`,
  `tasks.md`) are the same shape, in `.specify/` and `specs/NNN-slug/`, so a folder she worked in reads
  like one a person worked in with spec-kit.
- **[RRSI (arxiv 2609.24972, google-research/rrsi)](https://arxiv.org/abs/2609.24972)** — an agent's
  behaviour is set by the words around the frozen model, so improving the agent means editing those
  words. That's [evolve.md](evolve.md), and the harness files it edits are the `/harness` folder.

## A work order, end to end

1. **You** give her a folder and a sentence: *"make the header sticky and tidy the navigation"*.
2. **Spec.** She reads the constitution of that folder, then writes `spec.md`: what is wanted, what it
   must do, how we'll know it's done, what is deliberately left out.
3. **Plan.** `plan.md`: the approach, every file it touches and why, how it will be checked, the risks.
4. **Tasks.** `tasks.md`: five to twelve numbered steps (T001…), the last one always being the check.
   Each step leaves the folder working.
5. **Build.** One task at a time, with the tools below: read, patch, run, verify, mark it done.
6. **Report.** `report.md` (what's done, what was checked, what's left), and a paragraph to you in her
   own voice. `state.json` next to it is the board exactly as it was.

Everything is on disk while it runs, so closing the board (or the app) doesn't lose the record.

## Her tools inside a folder

Function calling, one call at a time, all of them checked by `agent/guard.js` first:

| Tool | What it does |
|---|---|
| `read_file` | a text file, with an offset for the rest of it |
| `write_file` | a whole file (512 KB at most) |
| `patch_file` | find this exact text once, replace it — refused if it appears twice or not at all |
| `list_dir` | the files of a folder, `node_modules` and `.git` left out |
| `search_files` | every matching line, with file and line number |
| `run_command` | a command in the folder — argv, no shell in the way, at the level in her menu |
| `update_plan` | this step is done (and what it did) or failed (and what stopped it) |

### The guard

Two rules, and they hold at every autonomy level:

- **Files stay inside the folder of the work order.** Every path is resolved and compared against the
  folder root; `..`, absolute paths and drive letters of their own are refused.
- **Commands are argv, never a shell.** `&&`, `|`, `>`, `%VAR%` are never interpreted by anything: a
  command line is split into arguments and run with `execFile(…, { shell: false })`. There is no
  quoting to get wrong, and no injection to get right.

`autonomy` decides what may run inside those two rules (her menu › **Work** › **What she may run**):

- **`full`** (the default) — the same reach the harness driving this desktop has: any program, a shell
  too (`pwsh -Command "npm test | tee log"`), so she can drive a machine and not only a repo.
- **`trusted`** — any program except the destructive ones and the shells.
- **`guard`** — only the tools a project is made of: `node`, `npm`, `pnpm`, `git`, `python`, `pip`,
  `cargo`, `go`, `dotnet`, `tsc`, `pytest`, `rg`…

At every level, a fixed set is refused: `format`, `diskpart`, `bcdedit`, `reg`, `sc`, `netsh`,
`takeown`, `icacls`, `shutdown`… A work order is not going to format a disk. Neither level can install a
service or mount one either — that's a click of yours. A refusal is returned to her model as text, so
she learns the rule instead of retrying blindly — and it's on the board, red.

## What you can hand her

Before a work order starts, the board takes what you give it (a chip each, an `×` to take it back off):

- **Files…** — a file picker, several at a time.
- **Clipboard** — whatever is on it: the files Windows puts there (`FileNameW`, so a file copied in
  Explorer) *and* its text. A copied paragraph is context; a copied file is a file.
- **A drop** — drag files onto the board. (Dropped anywhere else, nothing happens: the overlay never
  navigates.)

Each one becomes three things:

1. a block in the spec prompt — the text, or what the picture shows, or the fact that it is a
   `report.pdf` and was not read;
2. a copy under `specs/NNN-slug/attachments/` and an `attachments.md` beside the spec, so her model can
   read it again by itself with `read_file`;
3. a chip on the board, so you can see what went in.

**Pictures need eyes.** A picture is described by whatever model is answering (one call, at the start of
the work order, with the goal as the question: *"what is in this picture, transcribe any text"*). With a
vision model — Claude through her providers, Gemini, an Ollama vision model — you get a real
description. With `deepseek-flash`, which cannot see, the block says so in plain words: *"a picture, and
the model behind you could not look at it"*. It is never silently dropped, and the model is told to say
so if the work depends on it.

## What it reports

The last phase writes `report.md` (Done / Checked / Left open) **and** one paragraph in the voice of
whoever is on the desktop. `narrator` comes from the character's own `skin.json` `persona` — so a work
order run by Johnny Silverhand is written and reported by Johnny Silverhand, dry and short, and one run by
Capri sounds like Capri. That paragraph is what the board shows when the order is over, and what the
panel says when it lands.

## While it runs

The board (`src/renderer/js/board.js`, `styles/board.css`) sits on the right of her screen:

- the five phases as a stepper, the way spec-kit orders them;
- **NOW** — the one loud thing: the step she is on, and its meter;
- the steps, from `tasks.md`, queued/running/done/failed/skipped;
- a short log of what she just did (`PATCHES src/header.css`, `RUNS npm test`, `ok · 1.2 s`);
- the clock, **Stop**, **Folder**.

She acts out the phase she is in — curious while writing the spec, talking while building, the victory
sequence when the report lands, a flinch on a failure — and keeps her own line on the panel for the end.

The board only ever draws a snapshot the main process sends (`work:state`), so it can't get ahead of
what actually happened. A stopped run says "stopped" and leaves the files it wrote.

## Where it lives

```
src/main/agent/
  index.js     the one object main.js talks to
  runner.js    a work order: the five phases, the tool loop, the events
  plan.js      the board's model (steps, status, log) and its snapshot
  spec.js      spec-kit artifacts: numbering, slug, constitution, parseTasks, tick
  guard.js     what may be read, what may be run
  fsx.js       the folder: read, write, patch, list, search
  exec.js      run a command, no shell, with a clock
  attach.js    what you hand her: files, clipboard text, pictures
  prompts.js   what she is told, built from /harness and from whoever is on the desktop
  store.js     her storage: harness, observations, plans, evolution
  evolve.js    RRSI-lite: [evolve.md](evolve.md)
harness/       her words, and the only thing evolve.js may rewrite
```

`store.ensure()` copies `/harness` into her own storage (`<userData>/agent/harness`) on first run, so
app updates reach the defaults while her edits survive.

## Costs

Each phase is one model call; each build step is one per tool round (eight rounds at most, then one
last turn where `update_plan` is the only tool on the table, so a step always ends with done or failed).
A picture adds one vision call. A work order of eight steps is roughly 15–25 calls. The board's elapsed
time is real; there is no token meter — her provider's dashboard is the place for that.

## Trying it from a terminal

```bash
npm run try -- "make hello.txt that says nova" C:\some\scratch\folder
npm run try -- "write greeting.txt from the notes I gave you" C:\scratch C:\scratch\notes.txt
```

`scripts/try-work.js` runs a real work order through the same runner the board drives, on the provider
and model her setup uses, and prints every phase, every tool call and her report at the end. A file after
the folder is handed to her exactly as the board's **Files…** would. Use a scratch folder.

## What it doesn't do

- **No shell at `guard` or `trusted`.** `npm test | tee log` needs `full` (or `npm test`). At `full`, a
  shell is available and the pipes inside it are the shell's business.
- **No eyes of its own.** Pictures are only read if the model behind her can see; otherwise they are
  named and flagged, never guessed at.
- **No network tool.** She has no fetch; whatever she *runs* may reach the network.
- **No self-modification of the app.** `evolve.js` edits `harness/*.md` and nothing else: not
  `src/`, not your files, not her config. See [evolve.md](evolve.md).
- **No silent autonomy.** The level is in the tray under **Work**, and it is `full` until you say
  otherwise.
