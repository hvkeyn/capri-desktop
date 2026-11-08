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
    intro/        the frames it comes in with, or one film of it (optional)
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
- `stances` (optional) are the drawings it wears while it is being handled, instead of the pose: the
  app's own stance names, one picture each — `held` (picked up with the pointer), `fall` (in the air),
  `down` (knocked down), `peek` (leaning over a window's edge) —
  `{"held": {"image": "poses/held.png", "at": [118, 24]}, "down": {"image": "poses/floor.png", "head": [121, 274]}}`.
  `at` is the point of the picture the pointer holds (a raised hand, in the sheet's pixels): it stays
  under the cursor and she swings around it. `head` is where her head is on a drawing of her down, for
  the stars over it. The pose, or the loop, the stance covered comes back when she is on her feet.
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
- `squash` (`false`, optional) drops the rig's squash and stretch too — a landing flattening her, a jump
  stretching her. Art that is a photograph of someone reads as broken when it is flattened, so a skin
  like that turns it off; drawn art keeps it, because there it is the impact.
- `rim` (0 to 1, optional) is the violet copy knocked out of register behind the figure. It is part of her
  own art's look; art drawn without it looks better with `"rim": 0`.
- `theme` (optional) is the look of her windows while this character is on the desktop: one of the app's
  themes, `"yorha"` in the tray's Style menu (`styles/yorha.css`), or her own `nightcity` / `classic`. The
  one you had is put back when you pick someone else.
- `intro` (optional) is how it comes in, played once at start. Frames, played as a storyboard:
  `{"frames": ["intro/01.png", "…"], "closeupFrom": 6, "durations": [230, 220, …],
    "captions": [{"from": 6, "text": "WAKE UP"}, {"from": 9, "text": "WE HAVE A CITY TO BURN"}],
    "cover": false, "dissolve": true, "line": "…"}`.
  Frames cross-fade; `cover` fills the screen with whole pictures (a room behind them) instead of floating
  a cut-out; `dissolve: false` switches off the app's own dissolving exit for a sheet that already
  dissolves; `captions` are the yellow slabs; `line` is what it says once it's the little avatar.
  Or one film of it, instead of frames:
  `{"video": "intro/entrance.mp4", "volume": 0.9, "fade": 2.2,
    "captionsByLang": {"en": [{"at": 3, "text": "COMMAND IS THE ONE WHO BETRAYED YOU"}]},
    "lineByLang": {"en": "A2. Don't stand in my way."}}`.
  The film fills the screen (`object-fit: cover`) and brings its own sound; `fade` is how many seconds of
  that sound are taken down to silence at the end, so a cut doesn't stop the music mid-note. Its captions
  say *when* in seconds (`at`), not which frame. It plays whole, like her own entrance; it is not played
  when the app is started with Windows, nor with Windows' animations off.

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

## About A2

The `a2` folder is the other character this fork ships: YoRHa Type A No. 2 from **NieR: Automata**,
built from the renders in the `A2` folder beside this repository — one standing figure and three pose
sheets on a green screen. `tools/make-a2.py` does the whole cut: it keys the green out (and takes it back
out of the edges, so no halo shows on a dark desktop), puts every pose on her 240 x 420 rig at one scale
(a crouch really is lower than a stand), cuts her head for the panels, five close-ups for the cut-ins,
and the two breathing loops. Two of the drawings are not poses but stances: hanging from her raised hand
while you carry her with the pointer, and falling. Regenerate it with:

```bash
python tools/make-a2.py            # ../A2 -> assets/characters/a2, needs Pillow, numpy, OpenCV
```

The entrance is a film (`intro/entrance.mp4`): she walks in, lands, and turns to the camera, with its
music fading out over the last two seconds. Her voice is hers — `lines/ru.json` and `lines/en.json` are
written in A2's own clipped way, and her `persona` keeps the model in the same register. She brings the
**YoRHa** windows with her (`theme: "yorha"`): warm black plates, cream type, one hairline and a corner
tick at each corner, and no neon at all. Pick anyone else and your own theme comes back.

She is worn, not bent: `flat` and `squash: false` keep her photographic art out of the rig, and the
drawings of being handled (`stances`) take over while she is picked up, falling or knocked out — hung
from her own hand, in the air, and sitting on her legs with the stars over her head, instead of lying on
her side.

Her art is fan work for this noncommercial fork; NieR: Automata, A2 and everything with its name on it
belong to Square Enix and PlatinumGames.

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
