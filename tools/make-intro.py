"""Turns a green-screen storyboard strip into the frames of a character's intro.

Splits the strip on its empty gutters, keys the green out (flood from the edges, then anything the
green still dominates), trims each frame and scales it for the screen.

usage: python tools/make-intro.py <strip.png> <out-dir> [max-height]
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def cells(img):
    """The frames are the green panels: cut the strip at its dark gutters, keep the green in each."""
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = (g > 80) & (g > r * 1.2) & (g > b * 1.2)
    dark = rgb.max(axis=2) < 32

    def runs(flags, gap=4, min_len=40):
        out, start, empty = [], None, 0
        for i, on in enumerate(flags):
            if on:
                if start is None:
                    start = i
                empty = 0
            elif start is not None:
                empty += 1
                if empty >= gap:
                    if i - empty + 1 - start >= min_len:
                        out.append((start, i - empty + 1))
                    start = None
        if start is not None and len(flags) - start >= min_len:
            out.append((start, len(flags)))
        return out

    # panels between dark columns; if the strip has none, fall back to where the green is
    gutters = dark.mean(axis=0) > 0.9
    spans = runs(~gutters, gap=2, min_len=80) if gutters.any() else runs(green.any(axis=0), gap=6, min_len=80)

    boxes = []
    inset = 3  # the panels have a light seam a few pixels wide: keep it out of the picture
    for x0, x1 in spans:
        band = green[:, x0:x1]
        if not band.any():
            continue
        rows = np.where(band.any(axis=1))[0]
        cols = np.where(band.any(axis=0))[0]
        y0, y1 = int(rows.min()) + inset, int(rows.max()) + 1 - inset
        bx0, bx1 = x0 + int(cols.min()) + inset, x0 + int(cols.max()) + 1 - inset
        if (bx1 - bx0) * (y1 - y0) > 20000:
            boxes.append((bx0, y0, bx1, y1))
    return boxes


def key_green(cell):
    """Green gone, softly: alpha from how green a pixel is, then a despill so no halo survives."""
    img = cell.convert("RGBA")
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # greenness: how far the green channel runs past the other two, 0 (not green) to 1 (pure screen)
    greenness = np.clip((g - np.maximum(r, b)) / np.maximum(g, 1.0), 0.0, 1.0)
    alpha = np.clip((0.55 - greenness) / 0.25, 0.0, 1.0)
    # the screen colour bleeds a little into hair and shadows: don't let green lead red or blue
    px = arr.copy()
    px[..., 1] = np.minimum(px[..., 1], np.maximum(px[..., 0], px[..., 2]))
    out = Image.fromarray(np.dstack([np.clip(px, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")
    out.putalpha(out.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)))
    box = out.getbbox()
    return out.crop(box) if box else out


def main(strip, out_dir, max_height=1000):
    os.makedirs(out_dir, exist_ok=True)
    img = Image.open(strip).convert("RGB")
    found = cells(img)
    print("frames:", len(found))
    for i, (x0, y0, x1, y1) in enumerate(found):
        frame = key_green(img.crop((x0, y0, x1, y1)))
        if frame.height > max_height:
            ratio = max_height / frame.height
            frame = frame.resize((max(1, round(frame.width * ratio)), max_height), Image.LANCZOS)
        path = os.path.join(out_dir, f"{i + 1:02d}.png")
        frame.save(path)
        print(f"  {i + 1:02d}: {frame.width}x{frame.height} -> {path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1000)
