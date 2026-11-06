"""Splits a storyboard sheet (a grid of frames on white gutters) into numbered PNGs.

usage: python tools/split-sheet.py <sheet.png> <out-dir> [scale]
"""
import os
import sys
import numpy as np
from PIL import Image


def runs(flags, gap=2, min_len=30):
    """Start/end of every run of `True`, tolerant of a couple of stray pixels."""
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


def main(sheet, out_dir, scale=3.0):
    os.makedirs(out_dir, exist_ok=True)
    img = Image.open(sheet).convert("RGB")
    grey = np.asarray(img.convert("L"))
    white = grey > 225
    cols = runs(white.mean(axis=0) > 0.8, gap=2, min_len=2)
    rows = runs(white.mean(axis=1) > 0.8, gap=2, min_len=2)

    def between(blocks, total, min_size=40):
        out, prev = [], 0
        for a, b in blocks:
            if a - prev >= min_size:
                out.append((prev, a))
            prev = b
        if total - prev >= min_size:
            out.append((prev, total))
        return out

    xs = between(cols, img.width)
    ys = between(rows, img.height)
    n = 0
    for y0, y1 in ys:
        for x0, x1 in xs:
            cell = img.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))  # a pixel of gutter either side
            if cell.width < 40 or cell.height < 40:
                continue
            if scale and scale != 1:
                cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.LANCZOS)
            n += 1
            cell.save(os.path.join(out_dir, f"{n:02d}.png"))
            print(f"{n:02d}: {cell.width}x{cell.height}")
    print("frames:", n, "grid:", len(xs), "x", len(ys))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 3.0)
