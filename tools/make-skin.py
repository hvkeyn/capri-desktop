"""Builds a Capri character skin out of a rendered figure on a flat background.

Cuts the background away (flood fill from the edges), then fits the figure onto Capri's 240x420 sheet,
lined up with her rig: head around y 130, feet at the bottom, the middle on x 118. Also cuts a square
face for her panels out of the same picture.

usage: python tools/make-skin.py <figure.png> <out-dir> [name]
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

W, H = 240, 420
MARK = (255, 0, 255)


def cut_out(img):
    """Background gone: flood fills from the border over what looks like the background colour."""
    rgb = img.convert("RGB").copy()
    w, h = rgb.size
    for point in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if rgb.getpixel(point) != MARK:
            ImageDraw.floodfill(rgb, point, MARK, thresh=40)
    mask = Image.new("L", (w, h), 255)
    px = rgb.load()
    mk = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if (r, g, b) == MARK:
                mk[x, y] = 0
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out.crop(out.getbbox())


def fit_rig(figure, height=306, feet_y=415, axis_x=118):
    fig = figure.copy()
    ratio = height / fig.height
    fig = fig.resize((max(1, round(fig.width * ratio)), height), Image.LANCZOS)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sheet.paste(fig, (axis_x - fig.width // 2, feet_y - fig.height), fig)
    return sheet


def face_of(figure, size=256):
    """His head, squared: the top of the figure down to about a fifth of its height."""
    w, h = figure.size
    top = int(h * 0.02)
    bottom = int(h * 0.28)
    head = figure.crop((0, top, w, bottom))
    box = head.getbbox() or (0, 0, w, bottom - top)
    head = head.crop(box)
    side = max(head.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(head, ((side - head.width) // 2, (side - head.height) // 2), head)
    return square.resize((size, size), Image.LANCZOS)


def main(src, out_dir, name="johnny"):
    os.makedirs(out_dir, exist_ok=True)
    figure = cut_out(Image.open(src).convert("RGBA"))
    fit_rig(figure).save(os.path.join(out_dir, "full.png"))
    face_of(figure).save(os.path.join(out_dir, "face.png"))
    print(f"{name}: full.png {W}x{H}, face.png 256x256 -> {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "johnny")
