# Capri

A personality on your desktop that actually does things: she watches the machine, reads your screen, searches
your files, writes code through Claude Code, and reports back in her own voice. A fork of
[capri](https://github.com/ilharpg/capri) with the working half built out — work orders, full system access
behind a guard, file search, screen reading, and a self-improving harness.

Windows 10/11, x64. Electron. No framework, no cloud of its own: the AI is yours (DeepSeek, OpenAI, Ollama,
Claude Code), and the rest runs on the machine.

[Download](https://github.com/hvkeyn/capri-desktop/releases/latest) · [What's new](#what-this-fork-adds) ·
[Her tools](#her-tools) · [Build it](#build-it) · [Docs](docs/)

---

## What this fork adds

The upstream project is a beautiful animated character that can talk. This fork gives her hands:

- **Work orders** — she takes a sentence ("make the tests pass"), puts it on a five-phase board
  (understand → plan → build → check → report), writes the spec-kit paperwork under `specs/`, and runs Claude
  Code on it. You watch the board; the report is hers.
- **Hands on the machine** — 16 tools behind one guard, from `system_info` and `find_files` to
  `run_command`, `copy_file` and `see_screen`. Guard levels (`guard`, `trusted`, `full`) decide how far she
  reaches; catastrophic commands are refused at every level.
- **File search** — a Kensaku-inspired name index (in memory, ten minutes, names only) with filters like
  `ext:pdf`, `in:projects`, `modified:>7d` and "last week". File work: `file_info`, `tree`, `copy_file`,
  `move_file`, and a `delete_file` that puts things in `~/.capri-trash`, not the void.
- **Eyes** — `see_screen` captures the desktop and either has a vision model describe it or reads the text
  off it with Windows' own OCR (Russian and English). A text-only model can still answer "what's on my
  screen?".
- **A voice that doesn't loop** — her lines are drawn from a shuffled bag (no repeats until the pool is
  used up, never twice in a row), her offline packs are ten times bigger, and the tray can ask the model to
  write her more, in her voice, kept on disk for when there is no model at all.
- **She reads well** — the answer is set for reading: paragraphs, a real line height, its own scroll, with
  the key words in yellow, phrases in «quotes» in cyan and every number with a unit lit.
- **You watch her think** — while a turn runs, the panel shows her own remark and then each tool as a glyph,
  a verb, what it touched and how long it took, in the colour of that kind of work.
- **She grows between versions** — a self-improvement loop (RRSI-lite) rewrites her harness notes from your
  corrections, with a budget, a critic and backups.
- **She updates herself** — GitHub releases, streamed download, in-place swap, relaunch.

## The guitar

Johnny can put the desk aside and play. **Her menu → `Play the guitar`** (or the tray item) and he sits on
the edge of the window he is on — or in the corner of the screen — and plays one whole song from the game's
soundtrack.

- **24 frames**, cut from seven drawn phases and laid out as a long wave (1-7, then 6-2, twice), played at
  115 ms a frame: a slow, tired strum, not a slideshow.
- **His size is yours**: the figure is 0.55 of the character size you picked in the menu and sits exactly
  where he stands. One of him on screen — the standing avatar leaves through a glitch, the guitar arrives
  through the same glitch, and afterwards it goes back the same way.
- **The whole song, not a loop**: the thirteen tracks live in one file and are played as segments, from the
  first note to the last. A song ends by itself; if you cut it short (the menu item again, her chat, a call)
  it comes apart in a glitch. No teleports, no idle stunts while he plays.
- **The tracks are also yours to keep**: `C:\Users\<you>\Music\Capri Guitar` holds all thirteen as
  separate MP3s, named and timed.

## A2

The other character this fork ships is **A2** (YoRHa Type A No. 2) from *NieR: Automata*: her figure and
eight poses cut out of the renders in `A2/` beside the repo, two breathing loops, five close-ups for her
cut-ins, and — unlike Johnny — drawings for being handled: hanging from one hand, falling, and sitting on
the floor when she is knocked out.

- **Her entrance is a film** (`assets/characters/a2/intro/entrance.mp4`): the whole screen, her own sound,
  four lines over it in the language you picked, and the music brought down over the last two seconds so
  the cut doesn't stop it mid-note.
- **She is worn, not bent**: `"flat": true` keeps her photographic art out of the rig, `"squash": false`
  keeps a landing from flattening her like a cel, and the drawings of being carried, falling or being
  knocked out are swapped in whole (`stances`) instead of deforming her one picture. Carried, she hangs
  from her own raised hand — the hand is what stays under the cursor, and she swings on it.
- **Her size is yours**: pick it in **Her size** (small / medium / large). Her art is cut to the same
  306-pixel figure Johnny's is, so the multiplier in `skin.json` only compensates for the sheet, not a
  taste in size — at *medium* she stands about as tall as Capri does.
- **Her windows are YoRHa's** (`"theme": "yorha"`): warm black plates, cream type, one hairline and a
  corner tick at each corner, no neon anywhere. Pick anyone else and your own theme comes back.
- **Her voice is hers**: her `persona` and `lines/ru.json` / `lines/en.json` — command, the allies who
  forgot, and the one who never will — keep the model in A2's clipped, tired register.

Her art is fan work for this noncommercial fork (see Credits).

## Install

1. Take `Capri-x.y.z-portable.exe` from [Releases](https://github.com/hvkeyn/capri-desktop/releases/latest).
2. It isn't code-signed, so SmartScreen may ask: **More info** → **Run anyway**.
3. Start her, open the tray icon, choose **Her AI** → provider, model, key. DeepSeek, OpenAI, Ollama and
   Claude Code all work; the panel tells you what's missing.
4. Who lives on your desktop: **Character** → **Capri**, **Johnny Silverhand** or **A2**.

The portable exe keeps itself in `%LOCALAPPDATA%\Programs\Capri` and updates in place.

## Talking to her

Click her, or **Talk to her** in the tray. Ask in words; she picks the tools.

- *What's up with my PC?* → `diagnose`: processor, memory, disk, temperatures, devices, the heaviest
  programs, and a short list of findings.
- *Find that PDF about indexing, from last week* → `find_files` with filters, ranked.
- *What's on my screen, what do you think?* → `see_screen`, then her read of it.
- *Copy this to the project folder* → `file_info`, then `copy_file` (full access only).
- *Read this page and tell me what changed* → `web_fetch`.

She narrates before and after a tool — one line in character, never a log. If something is refused, she says
why and keeps going; a refusal is a rule, not an obstacle.

## Her tools

| Tool | What it does |
| --- | --- |
| `system_info` | OS, processor, GPU, memory, disks, battery, network, processes, temperatures, devices |
| `diagnose` | One call over all of the above, plus findings (disk < 10 %, memory > 85 %, a hot GPU) |
| `open_apps` | What's running, with windows |
| `find_files` | Name search with `ext:`, `in:`, `modified:>7d`, `size:>10mb`, "last week", "в проекте" |
| `file_info` / `tree` | What a thing is; the shape of a folder |
| `list_dir` / `read_file` / `search_files` | Reading, with limits and a text cap |
| `copy_file` / `move_file` / `delete_file` | One file at a time, full access only, delete goes to the bin |
| `run_command` | A program, at the level in her menu; argv, no shell unless you asked for one |
| `web_fetch` | A page's text, title kept |
| `see_screen` | The screen: a description with a vision model, otherwise Windows' OCR text |

**Tools of your own**: `harness/tools.json` — a command with `{placeholders}`, at its own level. A copy in
`%APPDATA%\capri-desktop\agent\tools.json` adds to them without touching the app:

```json
{ "name": "startup_apps", "description": "What starts with Windows", "autonomy": "full",
  "command": "powershell -NoProfile -Command \"Get-CimInstance Win32_StartupCommand | ConvertTo-Json\"",
  "parameters": { "type": "object", "properties": {}, "required": [] } }
```

## Work orders

Say what you want in the board (**Give her work** in the tray), pick a folder. She writes a spec under
`specs/NNN-slug/` (spec, plan, tasks, state, report), then runs the five phases with Claude Code, updating
the board and the spec as she goes. Attachments (files, clipboard) are copied into `specs/NNN/attachments`
and named in the spec. At the end you get a report in her voice, and the files are in your folder.

## Search and files

The name index is Kensaku's idea, not its code: names, sizes and dates are walked here and kept in memory
for ten minutes; **nothing about your folders is written to disk**. Content is read on demand. Filters are
part of the query: `ext:pdf`, `in:projects`, `modified:>7d`, `size:>10mb`, `last week`, `в проекте`. The
"project" is the folder Claude Code works in (or the work order's folder), even on another drive.

## Her voice

- Every line she says comes from a pool, and the pool is drawn as a **shuffled bag**: each line once before
  any repeats, never the same line twice in a row.
- The shipped packs are large (Johnny: 10–27 lines per situation in Russian, 10 in English).
- **Write her some new lines…** in the tray asks the model for a batch per situation (hello, resume, idle,
  work, done, error, alert, bye) in her voice and language, checks it (short, no duplicates), and keeps it in
  `%APPDATA%\capri-desktop\agent\lines\<character>-<lang>.json`. Those are used at once and **at the next
  start, offline included**.

## Her voice, out loud

Right-click her › **Her voice**. She says her lines and her chat's answers aloud; a new line cuts off the
last one, her blips keep quiet while she talks, and her volume and mute apply.

| What | What it is | What you need |
| --- | --- | --- |
| **Windows voices** (free) | the voices already on your PC | nothing — *Set her voice…* picks one |
| **On my PC** (Kokoro…) | a speech server you run, much better sounding, still free | its address (`http://127.0.0.1:8880/v1` by default) |
| **OpenAI** | OpenAI's voices, told how she sounds | your OpenAI key |
| **ElevenLabs** | a voice you design for her | your ElevenLabs key and the voice's ID |

**On your PC, free:** [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) speaks the same language as
OpenAI's speech service. Start it, then pick *On my PC* and leave the address empty. Voices: `af_bella`,
`af_nicole`, `af_sky` in English, `ff_siwis` in French, `ef_dora` in Spanish, `pf_dora` in Portuguese.

**A voice made for her (ElevenLabs Voice Design):** open *Voice Design*, paste the text below, generate, keep
the take you like and save it. Copy its *Voice ID*, then in Capri: *Her voice* › *ElevenLabs*, your key, and
the ID.

```
A young woman in her early twenties. Cool, a little teasing, with a dry sense of humor and a confident,
relaxed delivery. Low-to-mid pitch, slightly husky, clear diction, unhurried. She sounds amused more than
excited, never bubbly, never childish. A faint electronic edge, as if she comes through a speaker. Studio
quality, no background.
```

It makes a new, synthetic voice. Don't clone a real person's voice (an actress, a streamer, a friend) without
their clear consent: it's against the services' rules, and against Capri's.

What she says out loud goes to the service you picked (nothing at all with Windows voices or a server on your
PC). The keys stay in the main process, encrypted, and her last 40 lines are kept, so the ones she says often
aren't asked for twice.

## Reading the panel

- **The thinking stream**: her remark in italic, then each tool as a coloured row — glyph, verb, target,
  time. Reading is cyan, running yellow, searching green, writing accent, failing red.
- **The answer**: mono, a real line height, its own scroll (up to half the screen), paragraphs kept, key
  words in **yellow**, «quoted phrases» in cyan, numbers with units lit. She is told to bold one to three key
  words per answer.
- Her frame, her face and the activity dot follow the same colours, so you can tell "reading" from "running"
  from across the room.

## Guard levels

- `guard` — reading and looking, no writes, no programs.
- `trusted` — writes inside the workspace, a short list of programs.
- `full` — any program, any file in reach.

Catastrophic commands (disk formatting, recursive deletes of roots, shutdown) are refused at every level.
Every command is an argv array; `shell: false` unless the command itself is a shell.

## Privacy

Config lives in `%APPDATA%\capri-desktop` (keys encrypted with Windows DPAPI where the provider allows).
The screen is captured only when `see_screen` is called. OCR is local. Nothing is sent anywhere except the
model call you configured, and the GitHub release check.

## Updates

She checks GitHub releases (cached 12 h), downloads the portable exe in the background, swaps it in place and
relaunches. No installer, no admin rights.

## Build it

```bash
npm install
npm test            # 81 tests, node --test
npm run check:secrets
npm run dist        # portable exe + zip into dist/
```

Layout: `src/main` (Electron main: agent, tools, fss, ocr, lines, updater, guards), `src/renderer`
(character, panel, board, chat, styles), `assets/characters/<id>` (skins, motions, lines), `harness/`
(her evolvable notes and your tools), `specs/` (work-order paperwork), `tests/`.

## Characters

A character is a folder in `assets/characters/<id>`: `skin.json` (name, persona, palettes, frames, poses,
which languages of lines it has), motion atlases, sounds, and `lines/<lang>.json`. Drop a folder in, pick it
in the tray. The shipped ones are Johnny Silverhand and A2; the default is Capri. A character can also
bring the look of its windows (`"theme": "yorha"`) and an entrance film of its own
(`"intro": { "video": "intro/entrance.mp4" }`), with the music faded out over its last seconds.

## Credits

- Upstream character and panel: [capri](https://github.com/ilharpg/capri).
- Search ideas: [Kensaku](https://github.com/yjid/kensaku) (MIT) — the index, the filters, the "delete means
  the bin" courtesy. No code copied.
- Cyberpunk 2077 and its characters belong to CD Projekt Red. This is a fan project, not affiliated.
- NieR: Automata and A2 belong to Square Enix / PlatinumGames. The `a2` skin is fan art for a
  noncommercial fork, not affiliated.

MIT (see [LICENSE](LICENSE)).
