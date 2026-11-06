"""Pulls the frames out of the GIFs a character came with, and a contact sheet to look at them by.

usage: python tools/gif-frames.py <gif-dir> <out-dir> [frames-per-sheet]
"""
import os
import sys
import glob
from PIL import Image


def frames_of(path):
    gif = Image.open(path)
    out = []
    for i in range(getattr(gif, "n_frames", 1)):
        gif.seek(i)
        out.append(gif.convert("RGBA").copy())
    return out


def main(gif_dir, out_dir, per_sheet=6):
    os.makedirs(out_dir, exist_ok=True)
    sheets = []
    for path in sorted(glob.glob(os.path.join(gif_dir, "*.gif"))):
        name = os.path.splitext(os.path.basename(path))[0]
        frames = frames_of(path)
        folder = os.path.join(out_dir, name)
        os.makedirs(folder, exist_ok=True)
        for i, frame in enumerate(frames):
            frame.save(os.path.join(folder, f"{i:03d}.png"))

        # a contact sheet: `per_sheet` frames spread across the animation, side by side
        picks = [frames[round(i * (len(frames) - 1) / max(1, per_sheet - 1))] for i in range(per_sheet)]
        w, h = picks[0].size
        sheet = Image.new("RGBA", (w * len(picks), h), (32, 30, 40, 255))
        for i, frame in enumerate(picks):
            sheet.alpha_composite(frame, (i * w, 0))
        sheet.save(os.path.join(out_dir, f"sheet-{name}.png"))
        sheets.append((name, len(frames), (w, h)))
        print(f"{name}: {len(frames)} frames {w}x{h}")

    if sheets:
        widest = max(w for _, _, (w, _) in sheets) * per_sheet
        rows = [Image.open(os.path.join(out_dir, f"sheet-{n}.png")) for n, _, _ in sheets]
        total = sum(r.height for r in rows)
        all_sheet = Image.new("RGBA", (widest, total), (32, 30, 40, 255))
        y = 0
        for r in rows:
            all_sheet.alpha_composite(r, (0, y))
            y += r.height
        all_sheet.save(os.path.join(out_dir, "sheet-all.png"))
        print("all:", os.path.join(out_dir, "sheet-all.png"), all_sheet.size)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 6)
