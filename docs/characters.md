# Characters

Who lives on your desktop is a **character**: her (Capri, which ships with the app), or a folder of
pictures you drop in. Switching is one click, and it doesn't touch your chats, her bond with you or
anything else.

Right-click her (or the tray icon) › **Character** › pick one. **Open the characters folder…** in that
same menu opens `%APPDATA%\capri-desktop\characters\`, where your own go.

## A character is a folder

```
characters/
  johnny/
    skin.json
    full.png      the figure: 240 x 420, transparent background, feet at the bottom
    face.png      a face for her panels: 256 x 256 (optional)
    cutin-grin.png ...   close-ups for her cut-ins: 360 x 240 (optional)
    poses/        other drawings of the same figure (optional)
    motions/      frame folders for loops: smoke/000.png ...
    intro/        the frames it comes in with
    lines/        its own words: ru.json, en.json ...
```

`skin.json` says what's in there:

```json
{
  "label": "Johnny",
  "sprite": "full.png",
  "scale": 0.6,
  "faces": { "look": "face.png", "smug": "face.png", "laugh": "face.png" },
  "cutins": { "grin": "cutin-grin.png" }
}
```

- `label` is what the menu shows.
- `sprite` is the figure and the only required picture; without it the folder is ignored.
- `scale` (optional) is how big it starts out, the same 0.6 as her own art.
- `faces` and `cutins` are optional: a character that has none keeps hers, so her panels and effects
  still work.
- `poses` (optional) are other drawings of the same figure the menu can switch to, one image each
  (`"back": "poses/back.png"`).
- `sequences` (optional) are a few drawings played once, in order, like a flipbook —
  `"glasses": ["poses/glasses1.png", "poses/glasses2.png", "poses/glasses3.png"]` plays in her menu as
  **Take off his sunglasses**.
- `gender` (`"m"` or `"f"`, optional) is how the menu talks about them: "Talk to him" instead of "her".
- `holo` (0 to 1, optional) makes them flicker like a projection while they appear, vanish or change.
- `persona` (optional) replaces Capri's own lines in her chat: the character's voice.
- `lines` (optional) are their own words for everything she says on her own — `{"ru": "lines/ru.json"}`.
  The file has the same shape as her lines and is deep-merged over them, so a group left out stays hers:
  `hello`, `prompt`, `working` (`{count}`), `done`, `permission`, `error` (`{tool}`), `idle`, `thinking`,
  `chat.hello`, `pet`, `thrown`, `pc` (`{level}`, `{cpu}`) and so on. Anything in it that says "Capri" is
  renamed to the character's name too.
- `animations` (optional) are loops played by the app as real animation — `{"smoke": {"dir": "motions/smoke", "fps": 12}}`
  (or `"frames": [...]` instead of a folder). A loop is texture-swapped under the character, so it stays
  smooth; the menu lists them, and `auto.idle` can name them for the idle rotation.
- `flat` (`true`, optional) turns her rig off for art that isn't drawn for it: no mane flare, no arm
  reaching, no knee bends — just the character's own frames. Use it for a skin with real animation.
- `intro` (optional) is how it comes in — frames, played once at start:
  `{"frames": ["intro/01.png", "…"], "closeupFrom": 6, "durations": [230, 220, …],
    "captions": [{"from": 6, "text": "WAKE UP"}, {"from": 9, "text": "WE HAVE A CITY TO BURN"}],
    "cover": false, "dissolve": true, "line": "…"}`.
  Frames cross-fade; `cover` fills the screen with whole pictures (a room behind them) instead of floating
  a cut-out; `dissolve: false` switches off the app's own dissolving exit for a sheet that already
  dissolves; `captions` are the yellow slabs; `line` is what it says once it's the little avatar.

Two places are read, yours first:

- `%APPDATA%\capri-desktop\characters\<id>\` — yours, untouched by an update.
- `<the app>\assets\characters\<id>\` — what a build ships (the repo's `johnny` is a complete character:
  intro, poses, smoke and sadness loops, his own lines and persona).

## The figure is animated by her rig

Capri is not a sprite sheet: her single picture is deformed by a shader (head tilts, mane flares, arms
reach, she sits on windows and teleports), using landmarks in the picture's own pixels — head around
`(116, 132)`, shoulders at `y 168`, hips at `y 232`, knees around `y 305`, feet at the bottom, the
middle at `x 118`. So a character's art should be:

- **one upright figure**, cut out of its background, 240 x 420;
- head near the top fifth, shoulders around a third of the way down, feet on the bottom edge;
- at least 60 px of empty space to the left and right (she reaches sideways, and her mane flares).

Art that doesn't follow those proportions still shows up and moves, but her head will tilt around the
wrong point and her hands will reach out of thin air.

## About Johnny Silverhand

The `johnny` folder this fork ships is the project's own art: a cut-out figure, his close-ups, poses,
the smoking and sadness loops and his intro. It is freely licensed and lives in this repository; it is
not the Desktop Girlfriend NEO addon and does not use its files. To make him yours, replace the pictures
in `assets/characters/johnny/` (or copy the folder into `%APPDATA%\capri-desktop\characters\johnny\`)
and keep or edit the `skin.json` beside them.

## From a 3D model (a Unity `.char`)

A character can come as a Unity asset bundle — a `.char` from a game like Desktop Girlfriend NEO. That is
a skinned 3D model with its own textures, not a figure, so it needs one step first:

```bash
python tools/export-char.py my-character.char out/
# out/model.obj (one group per part) + out/textures/*.png
```

Then render **one front view**, T-pose, transparent: 240 × 420 or bigger (it can be cropped later). Blender
or any real renderer handles that OBJ; `tools/render-obj.py` gives a rough unlit preview if you only want
a look at the geometry — it is not good enough to ship. Put the render at `characters/<id>/full.png` with a
`skin.json` beside it, and it's a character.

## Text is theirs too

A character brings its own `persona` (who it is, how it talks) and its own `lines/<lang>.json` (what it
says on its own: starting a session, work in progress, done, errors, idle, being petted, the PC
reacting). It can also bring `intro.line` and captions.

When a model is set up, the app goes one step further: it asks it for a small batch of fresh remarks in
that character's voice, with the persona and the last few messages of your chat as context
(`src/renderer/js/improv.js`, IPC `voice:lines`). Those lines are used for idle talk, greetings, a
finished job and errors, and are rewritten as the conversation moves on. They are never saved as chat
history and never replace the written fallback: with no key, no network or a refusal, the `lines` files
still carry the character.

Her own panels and guide still use Capri's wording for anything a character hasn't overridden — that is
on purpose, so a half-written skin never shows an empty line.
