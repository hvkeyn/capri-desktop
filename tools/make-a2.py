"""Builds the "a2" character skin out of the renders in the A2 folder beside the repository.

The art arrives on a green screen: a standing figure (M.png), and seventeen more drawings on two
sheets (poses1.png, twelve in a 4 x 3 grid; poses2.png, five in a row). Eight of them are used.
Everything here is about getting it onto her rig, unchanged in every way that matters:

- the green is keyed out by how much greener a pixel is than anything light or dark in it, and the
  colour the fringe kept is taken back out of it, so no halo shows on a dark desktop;
- one figure is fitted to the 240 x 420 sheet her own art uses — feet on the floor line, the body's
  own axis on the sheet's middle — and every pose is fitted at the *same* scale, so a sitting pose
  really is lower than a standing one;
- the head is squared off for her panels, and five close-ups are cut for her cut-ins;
- two loops are made from the drawings, the way Johnny's were: a standing breath and a seated one.

    python tools/make-a2.py                    # from ../A2, into assets/characters/a2

Needs Pillow, numpy and OpenCV. `--dump` writes the pieces it cut out of the sheets to a folder, to
look at them before they are named.
"""
import argparse
import math
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 240, 420
CENTER_X, FLOOR_Y = 118, 415
RIG_HEIGHT = 306          # a standing figure, the height her own art is drawn at
FACE_PX = 256            # her panels
CUTIN = (360, 240)       # her cut-ins
INK = (20, 16, 28, 255)  # the ink a cut-in is flung over (fx.js COLORS.ink), behind the face
LOOP_FRAMES = 24
LOOP_FPS = 12

# A piece of a sheet: which sheet, how it is gridded, which cell, and what the pose is called in
# skin.json. "M" is the standing render, its own picture.
POSES = [
    ('poses2.png', 5, 1, 2, 'open'),     # arms open, palms up
    ('poses2.png', 5, 1, 3, 'point'),    # the right arm flung out, pointing
    ('poses2.png', 5, 1, 4, 'stance'),   # knee up, hand raised, hair thrown
    ('poses2.png', 5, 1, 5, 'sit'),      # sitting on a knee
    ('poses1.png', 4, 3, 1, 'floor'),    # sitting on the floor, legs out
    ('poses1.png', 4, 3, 6, 'kneel'),    # down on one knee
    ('poses1.png', 4, 3, 7, 'slouch'),   # standing, hands at her sides
    ('poses1.png', 4, 3, 12, 'lean'),    # leaning on a wall, one leg up
]


# ---------- the green screen ----------

def background(img):
    """The green screen's own colour: the median of a frame around the picture's edge."""
    px = np.asarray(img.convert('RGB')).astype(np.float32)
    band = np.concatenate([
        px[:4].reshape(-1, 3), px[-4:].reshape(-1, 3),
        px[:, :4].reshape(-1, 3), px[:, -4:].reshape(-1, 3),
    ])
    return np.median(band, axis=0)


def key(img):
    """The figure out of the green screen: an alpha where green stops being green, and the green the
    fringe blended in taken back out of the colour, so nothing of the screen shows around her."""
    rgb = np.asarray(img.convert('RGB')).astype(np.float32)
    bg = background(img)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dom = g - np.maximum(r, b)            # how much greener than its neighbours a pixel is
    lo, hi = 12.0, 46.0                   # under lo: her; over hi: the screen; between: an edge
    alpha = np.clip((hi - dom) / (hi - lo), 0.0, 1.0)
    # decontaminate: P = a * C + (1 - a) * bg  ->  C = (P - (1 - a) * bg) / a
    a = alpha[..., None]
    color = (rgb - bg * (1 - a)) / np.maximum(a, 0.02)
    color = np.clip(color, 0, 255)
    # what the green still tints (a soft edge over hair, a highlight on leather) goes neutral
    gr, gg, gb = color[..., 0], color[..., 1], color[..., 2]
    spill = np.maximum(gr, gb) + 8
    color[..., 1] = np.where(color[..., 1] > spill, spill, color[..., 1])
    out = np.dstack([color, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def largest(img):
    """The one figure in the picture: the biggest run of pixels, with the specks, grid lines and
    numbers of a sheet thrown away (they are thin, so an opening takes them out)."""
    arr = np.asarray(img).copy()
    mask = (arr[..., 3] > 90).astype(np.uint8)
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(opened, 8)
    if n <= 1:
        return img, None, None
    main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep = (labels == main).astype(np.uint8)
    # a soft edge is kept: everything within a pixel of the figure is allowed back in
    keep = cv2.dilate(keep, np.ones((3, 3), np.uint8))
    arr[..., 3] = np.where(keep > 0, arr[..., 3], 0)
    x, y, w, h = stats[main, cv2.CC_STAT_LEFT], stats[main, cv2.CC_STAT_TOP], stats[main, cv2.CC_STAT_WIDTH], stats[main, cv2.CC_STAT_HEIGHT]
    return Image.fromarray(arr, 'RGBA'), (x, y, w, h), (labels == main)


def pieces(sheet, cols, rows):
    """Every figure on a sheet, in reading order: the key, a picture per cell, and its box."""
    keyed = key(sheet)
    arr = np.asarray(keyed).copy()
    mask = (arr[..., 3] > 90).astype(np.uint8)
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(opened, 8)
    found = []
    for i in range(1, n):
        x, y, w, h = (int(stats[i, k]) for k in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP, cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT))
        if stats[i, cv2.CC_STAT_AREA] < 0.004 * mask.size or h < 0.08 * keyed.height:
            continue
        found.append((x, y, w, h, i))
    if not found:
        raise SystemExit('no figures on the sheet')
    # a cell each: the figure whose middle is nearest the cell's middle, every figure once
    cell_w, cell_h = keyed.width / cols, keyed.height / rows
    chosen, used = [], set()
    for band in range(rows):
        row = [f for f in found if band * cell_h <= f[1] + f[3] / 2 < (band + 1) * cell_h]
        row.sort(key=lambda f: f[0] + f[2] / 2)
        chosen.extend(row)
        used.update(f[4] for f in row)
    leftover = [f for f in found if f[4] not in used]
    leftover.sort(key=lambda f: (round((f[1] + f[3] / 2) / cell_h), f[0]))
    chosen.extend(leftover)
    out = []
    for index, (x, y, w, h, label) in enumerate(chosen, start=1):
        cut = np.asarray(keyed).copy()
        mine = cv2.dilate((labels == label).astype(np.uint8), np.ones((5, 5), np.uint8))
        cut[..., 3] = np.where(mine > 0, cut[..., 3], 0)
        pad = 6
        box = (max(0, x - pad), max(0, y - pad), min(keyed.width, x + w + pad), min(keyed.height, y + h + pad))
        out.append((index, Image.fromarray(cut, 'RGBA').crop(box)))
    return out


# ---------- onto her rig ----------

def trim(fig):
    box = fig.getbbox()
    return fig.crop(box) if box else fig


def axis(fig):
    """Where her body's middle is: the middle of the figure over her lowest fifth (feet, legs), not of
    the whole picture — an arm thrown out to the side would drag the body off the sheet."""
    alpha = np.asarray(fig.getchannel('A'))
    ys, xs = np.where(alpha > 60)
    if not len(ys):
        return fig.width / 2
    low = ys >= ys.max() - 0.18 * (ys.max() - ys.min())
    xs = xs[low]
    return float((xs.min() + xs.max()) / 2) if len(xs) else fig.width / 2


def on_rig(fig, px_per_unit, foot_y=FLOOR_Y):
    """`fig` scaled by `px_per_unit`, its body's middle on the sheet's middle, its lowest point on
    `foot_y`. The same factor for every pose keeps a crouch lower than a stand."""
    fig = trim(fig)
    width = max(1, round(fig.width * px_per_unit))
    height = max(1, round(fig.height * px_per_unit))
    fig = fig.resize((width, height), Image.LANCZOS)
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # a thrown arm may hang off the sheet, the body may not: keep at least 60 px of it inside
    x = round(CENTER_X - axis(fig))
    x = min(max(x, 60 - width), W - 60)
    sheet.alpha_composite(fig, (x, round(foot_y) - height))
    return sheet


def face_of(fig, size=FACE_PX):
    """Her head, squared: the top of the figure down to about a fifth of its height."""
    w, h = fig.size
    head = fig.crop((0, int(h * 0.005), w, int(h * 0.215)))
    box = head.getbbox() or (0, 0, w, head.height)
    head = head.crop(box)
    side = max(head.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.alpha_composite(head, ((side - head.width) // 2, (side - head.height) // 2))
    return square.resize((size, size), Image.LANCZOS)


def closeup(fig, box, size=CUTIN):
    """A 3:2 picture of `box` (a box in the figure's pixels), for a cut-in. The cut-ins are flung over
    a band of ink (fx.js), so the picture is put on that same ink instead of staying see-through."""
    crop = fig.crop(box)
    target = size[0] / size[1]
    w, h = crop.size
    if w / h > target:
        w = int(h * target)
        crop = crop.crop(((crop.width - w) // 2, 0, (crop.width + w) // 2, h))
    else:
        h = int(w / target)
        crop = crop.crop((0, (crop.height - h) // 4, w, (crop.height - h) // 4 + h))
    crop = crop.resize(size, Image.LANCZOS)
    plate = Image.new('RGBA', size, INK)
    plate.alpha_composite(crop)
    return plate.convert('RGB')


def cutins_of(fig):
    """Five close-ups of the same face, framed differently: the cut-ins flash by for a few frames, so
    what they need is a look, not an expression she was drawn with."""
    alpha = np.asarray(fig.getchannel('A'))
    ys, xs = np.where(alpha > 60)
    top, left, right = ys.min(), xs.min(), xs.max()
    head = 0.20 * (ys.max() - top)          # roughly her head
    cx = (left + right) / 2
    boxes = {
        # tight on her eyes, the widest of the lot, off to one side and up: five different framings
        'eyes': (cx - head * 0.55, top + head * 0.10, cx + head * 0.55, top + head * 0.85),
        'grin': (cx - head * 0.75, top + head * 0.15, cx + head * 0.75, top + head * 1.15),
        'look': (cx - head * 0.95, top + head * 0.02, cx + head * 0.95, top + head * 1.30),
        'many': (cx - head * 1.15, top + head * 0.30, cx + head * 1.15, top + head * 1.85),
        'laugh': (cx - head * 1.35, top - head * 0.05, cx + head * 1.35, top + head * 1.75),
    }
    return {name: closeup(fig, tuple(int(v) for v in box)) for name, box in boxes.items()}


# ---------- loops ----------

def breathe(pose, phase, slump=0.0, amp=1.0, scale=1.0):
    """The figure breathing: a bob, and a slow lean about her feet, one frame of the loop."""
    bob = math.sin(phase) * 1.4 * amp
    tilt = math.sin(phase * 0.5) * 1.2 * amp + slump
    frame = pose
    if abs(tilt) > 0.05:
        frame = pose.rotate(tilt, resample=Image.BICUBIC, center=(CENTER_X, FLOOR_Y - 60))
    if abs(scale - 1.0) > 1e-4:
        w = max(1, round(frame.width * scale))
        h = max(1, round(frame.height * scale))
        frame = frame.resize((w, h), Image.LANCZOS)
        sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sheet.alpha_composite(frame, (CENTER_X - w // 2, FLOOR_Y - h))
        frame = sheet
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sheet.alpha_composite(frame, (0, round(bob + slump * 0.7)))
    return sheet


def write_loop(folder, frames):
    os.makedirs(folder, exist_ok=True)
    for old in os.listdir(folder):
        if old.endswith('.png'):
            os.remove(os.path.join(folder, old))
    for i, frame in enumerate(frames):
        frame.save(os.path.join(folder, f'{i:03d}.png'))
    return len(frames)


# ---------- main ----------

def build(src, out, dump=None):
    os.makedirs(out, exist_ok=True)

    stand = trim(largest(key(Image.open(src / 'M.png')))[0])
    # her standing figure fills the rig's height (306 px of the 420-pixel sheet)
    full = on_rig(stand, RIG_HEIGHT / stand.height)
    full.save(os.path.join(out, 'full.png'))
    face_of(stand).save(os.path.join(out, 'face.png'))

    os.makedirs(os.path.join(out, 'cutins'), exist_ok=True)
    for name, image in cutins_of(stand).items():
        image.save(os.path.join(out, 'cutins', f'{name}.png'))

    # the pose sheets are drawn at a scale of their own: the tallest figure on one is a standing one,
    # so it is what says how tall the rig is for that sheet. Within a sheet the poses keep their own
    # sizes, which is what makes a crouch crouch.
    os.makedirs(os.path.join(out, 'poses'), exist_ok=True)
    split = {}
    for sheet in dict.fromkeys(entry[0] for entry in POSES):
        split[sheet] = pieces(Image.open(src / sheet), *next((c, r) for s, c, r, _, _ in POSES if s == sheet))
        if dump:
            os.makedirs(dump, exist_ok=True)
            for i, image in split[sheet]:
                image.save(os.path.join(dump, f'{sheet[:-4]}-{i:02d}.png'))
    scale = {sheet: RIG_HEIGHT / max(trim(image).height for _, image in figures) for sheet, figures in split.items()}
    for sheet, cols, rows, index, name in POSES:
        by_index = {i: image for i, image in split[sheet]}
        if index not in by_index:
            print(f'  {name}: no figure {index} on {sheet}, skipped')
            continue
        on_rig(by_index[index], scale[sheet]).save(os.path.join(out, 'poses', f'{name}.png'))
        print(f'  {name}: {sheet} #{index} at {scale[sheet]:.3f}')

    # the loops: a standing breath, and one taken sitting down
    loops = {
        'idle': full,
        'sit': on_rig({i: image for i, image in split['poses2.png']}[5], scale['poses2.png']),
    }
    for name, pose in loops.items():
        frames = [breathe(pose, i / LOOP_FRAMES * math.tau, amp=0.6 if name == 'sit' else 1.0)
                  for i in range(LOOP_FRAMES)]
        count = write_loop(os.path.join(out, 'motions', name), frames)
        print(f'  motions/{name}: {count} frames')

    print(f'written to {out}')


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src', default=str(here.parent.parent / 'A2'), help='the folder with M.png and the pose sheets')
    parser.add_argument('--out', default=str(here.parent / 'assets' / 'characters' / 'a2'))
    parser.add_argument('--dump', default=None, help='write the figures it found on the sheets here, to look at')
    args = parser.parse_args()
    build(Path(args.src), Path(args.out), args.dump)
