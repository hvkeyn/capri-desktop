"""Splits a pose sheet (several figures on one sheet) into one PNG per figure.

Works whether the sheet already carries transparency or sits on a flat background (that one is cut
away first, the way make-skin.py does it).

usage: python tools/split-poses.py <sheet.png> <out-dir>
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def has_transparency(img):
    if img.mode not in ("RGBA", "LA", "P"):
        return False
    alpha = np.asarray(img.convert("RGBA").getchannel("A"))
    return float((alpha < 8).mean()) > 0.05


def cut_out(img):
    rgb = img.convert("RGB").copy()
    w, h = rgb.size
    for point in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        ImageDraw.floodfill(rgb, point, (255, 0, 255), thresh=40)
    arr = np.asarray(rgb).astype(np.int16)
    outside = (arr[..., 0] == 255) & (arr[..., 1] == 0) & (arr[..., 2] == 255)
    pixels = np.asarray(img.convert("RGB")).astype(np.int16)
    bright = pixels.min(axis=2) >= 238
    holes = bright & ~outside
    seen = np.zeros_like(holes)
    for y0, x0 in zip(*np.where(holes)):
        if seen[y0, x0]:
            continue
        stack = [(int(y0), int(x0))]
        seen[y0, x0] = True
        blob = []
        while stack:
            y, x = stack.pop()
            blob.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and holes[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(blob) >= 24:
            ys = [p[0] for p in blob]
            xs = [p[1] for p in blob]
            outside[ys, xs] = True
    mask = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def components(mask, min_area):
    """4-connected blobs of a boolean mask (on a 2x downscale, so it stays quick)."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    found = []
    ys, xs = np.where(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(int(y0), int(x0))]
        seen[y0, x0] = True
        minx = maxx = int(x0)
        miny = maxy = int(y0)
        n = 0
        while stack:
            y, x = stack.pop()
            n += 1
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if n >= min_area:
            found.append((minx, miny, maxx + 1, maxy + 1, n))
    return sorted(found, key=lambda b: (b[1] // 200, b[0]))


def main(sheet, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    img = Image.open(sheet).convert("RGBA")
    figure = img if has_transparency(img) else cut_out(img)

    small = figure.resize((figure.width // 2, figure.height // 2), Image.NEAREST)
    mask = np.asarray(small.getchannel("A")) > 64
    parts = components(mask, min_area=8000)

    for i, (x0, y0, x1, y1, _n) in enumerate(parts):
        box = (x0 * 2, y0 * 2, x1 * 2, y1 * 2)
        crop = figure.crop(box)
        path = os.path.join(out_dir, f"pose{i + 1}.png")
        crop.save(path)
        print(f"pose{i + 1}: {crop.width}x{crop.height} at {box[:2]} -> {path}")
    if not parts:
        raise SystemExit("no figures found")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
