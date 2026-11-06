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

Two places are read, yours first:

- `%APPDATA%\capri-desktop\characters\<id>\` — yours, untouched by an update.
- `<the app>\assets\characters\<id>\` — what a build ships (the repo has `johnny` as a placeholder).

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

## About the Johnny Silverhand addon

[johnny-silverhand](https://www.moddb.com/games/desktop-girlfriend-neo/addons/johnny-silverhand) is an
addon for **Desktop Girlfriend NEO**: a Unity HDRP player model (`JohnnySilverhand.zip`, ModDB lists its
licence as **Proprietary**). Two consequences:

- it is **not** in this repository and cannot be: it isn't ours to redistribute;
- it is a 3D model for another game, not a 240 x 420 figure, so it can't be dropped into
  `characters/` as-is either.

The `johnny` folder this fork ships is a **placeholder** (`tools/make-johnny.py` draws it): it exists so
the switch can be tried, and so the folder shows the shape of a real one. For the real thing, put a
cut-out of him — from a screenshot you have the rights to, or your own art — into
`%APPDATA%\capri-desktop\characters\johnny\full.png` and keep or edit the `skin.json` beside it.

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

## Text stays hers

Her name in the panels, her lines, her voice: those are Capri's and are not part of a character yet. A
character changes the figure, its faces and its close-ups, not what she says.
