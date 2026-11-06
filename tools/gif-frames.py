"""Pulls every frame out of the GIFs a character came with, and builds storyboards to look at them by.

For each gif:
  frames/<name>/000.png …      every frame, full size, transparent as the gif was
  sheet-<name>.png             6 frames spread across the animation (a quick look)
  sheet-<name>-all.png         the whole animation as a grid (a storyboard)
And once, over all of them:
  sheet-all.png                the quick sheets, one gif per row
  manifest.csv                 gif, frame count, size, folder

usage: python tools/gif-frames.py <gif-dir> <out-dir> [columns]
"""
import os
import sys
import glob
import csv
from PIL import Image


def frames_of(path):
    gif = Image.open(path)
    out = []
    for i in range(getattr(gif, "n_frames", 1)):
        gif.seek(i)
        out.append(gif.convert("RGBA").copy())
    return out


def grid(frames, cols, cell):
    w, h = cell
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * w, rows * h), (32, 30, 40, 255))
    for i, frame in enumerate(frames):
        x = (i % cols) * w
        y = (i // cols) * h
        sheet.alpha_composite(frame, (x, y))
    return sheet


def main(gif_dir, out_dir, cols=12):
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    quick = []
    for path in sorted(glob.glob(os.path.join(gif_dir, "*.gif"))):
        name = os.path.splitext(os.path.basename(path))[0]
        frames = frames_of(path)
        folder = os.path.join(out_dir, "frames", name)
        os.makedirs(folder, exist_ok=True)
        for i, frame in enumerate(frames):
            frame.save(os.path.join(folder, f"{i:03d}.png"))

        # a quick look: 6 frames across the animation
        picks = [frames[round(i * (len(frames) - 1) / 5)] for i in range(6)]
        w, h = frames[0].size
        quick_sheet = Image.new("RGBA", (w * 6, h), (32, 30, 40, 255))
        for i, frame in enumerate(picks):
            quick_sheet.alpha_composite(frame, (i * w, 0))
        quick_sheet.save(os.path.join(out_dir, f"sheet-{name}.png"))
        quick.append(quick_sheet)

        # the whole animation: the storyboard to hand over
        grid(frames, cols, (w, h)).save(os.path.join(out_dir, f"sheet-{name}-all.png"))

        rows.append((name, len(frames), f"{w}x{h}"))
        print(f"{name}: {len(frames)} frames {w}x{h}")

    if quick:
        widest = max(s.width for s in quick)
        total = sum(s.height for s in quick)
        all_sheet = Image.new("RGBA", (widest, total), (32, 30, 40, 255))
        y = 0
        for s in quick:
            all_sheet.alpha_composite(s, (0, y))
            y += s.height
        all_sheet.save(os.path.join(out_dir, "sheet-all.png"))
        print("all:", os.path.join(out_dir, "sheet-all.png"), all_sheet.size)

        with open(os.path.join(out_dir, "manifest.csv"), "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["gif", "frames", "size", "folder", "sheet"])
            for name, count, size in rows:
                writer.writerow([f"{name}.gif", count, size, f"frames/{name}", f"sheet-{name}-all.png"])
        print("manifest:", os.path.join(out_dir, "manifest.csv"))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 12)
