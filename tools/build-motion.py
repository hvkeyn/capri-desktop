"""Builds transparent animation loops for the Johnny skin from the clean seated pose.

No room, no green screen: a fitted pose breathes, slumps or leans, and small procedural props do the
work вЂ” a cigarette with rising smoke, a guitar with a strumming hand. Every frame is transparent and
already in the 240x420 rig, so the app only swaps textures.

usage: python tools/build-motion.py <skin-dir> <out-dir>
"""
import os
import sys
import math
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

W, H = 240, 420
CENTER_X, BOTTOM_Y = 118, 415


def clean_alpha(image):
    """Drops the scraps a cut-out leaves behind (a sliver of the next figure, a bit of chair)."""
    arr = np.asarray(image.convert("RGBA")).copy()
    alpha = arr[..., 3]
    mask = (alpha > 20).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return image
    keep = np.zeros_like(mask)
    main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep[labels == main] = 1
    arr[..., 3] = np.where(keep > 0, alpha, 0)
    return Image.fromarray(arr, "RGBA")


def fit(frame, height):
    frame = clean_alpha(frame)
    box = frame.getbbox()
    if box:
        frame = frame.crop(box)
    ratio = height / max(1, frame.height)
    frame = frame.resize((max(1, round(frame.width * ratio)), height), Image.LANCZOS)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sheet.alpha_composite(frame, (CENTER_X - frame.width // 2, BOTTOM_Y - frame.height))
    return sheet


def body_frame(pose, phase, slump=0.0, breathe=1.0):
    """The seated figure, breathing (and slumping a little when sadness is the point)."""
    bob = math.sin(phase) * 1.4 * breathe
    tilt = math.sin(phase * 0.5) * 1.2 * breathe + slump
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    frame = pose
    if abs(tilt) > 0.05:
        frame = pose.rotate(tilt, resample=Image.BICUBIC, center=(CENTER_X, BOTTOM_Y - 60))
    sheet.alpha_composite(frame, (0, round(bob + slump * 0.7)))
    return sheet


def ember(layer, phase, tip=(128, 132)):
    draw = ImageDraw.Draw(layer)
    pulse = 0.6 + 0.4 * math.sin(phase * 3)
    draw.ellipse((tip[0] - 3, tip[1] - 3, tip[0] + 3, tip[1] + 3), fill=(255, 96, 28, int(180 * pulse)))
    draw.ellipse((tip[0] - 1, tip[1] - 1, tip[0] + 1, tip[1] + 1), fill=(255, 231, 170, 255))


def smoke_puffs(layer, phase, tip=(128, 132)):
    """Two thin wisps off the cigarette tip, overlapping into a stream, not bubbles."""
    draw = ImageDraw.Draw(layer)
    for stream in range(2):
        for i in range(10):
            t = (phase / math.tau + i / 10.0 + stream * 0.5) % 1.0
            x = tip[0] + 2 + t * 30 + math.sin(t * 7.2 + stream * 2) * 6
            y = tip[1] - 2 - t * 84
            radius = 1.6 + t * 6.2
            alpha = int((66 + stream * 16) * (1.0 - t) ** 0.8)
            if alpha <= 3:
                continue
            draw.ellipse((x - radius, y - radius * 0.8, x + radius, y + radius * 0.8), fill=(220, 225, 231, alpha))
            draw.ellipse((x - radius * 0.35, y - radius * 0.3, x + radius * 0.35, y + radius * 0.3), fill=(242, 245, 249, alpha))
    return layer.filter(ImageFilter.GaussianBlur(2.2))


def main(skin_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    seated = Image.open(os.path.join(skin_dir, "poses", "crouch.png")).convert("RGBA")
    seated = fit(seated, 250)
    smoking = clean_alpha(Image.open(os.path.join(skin_dir, "poses", "smoke.png")).convert("RGBA"))
    loops = {}
    for i in range(24):
        phase = i / 24 * math.tau
        smoke = body_frame(smoking, phase, breathe=0.6)
        prop = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ember(prop, phase)
        smoke.alpha_composite(smoke_puffs(prop, phase))
        loops.setdefault("smoke", []).append(smoke)

        sad = body_frame(seated, phase * 0.35, slump=5.0, breathe=0.5)
        loops.setdefault("sad", []).append(sad)

        idle = fit(Image.open(os.path.join(skin_dir, "full.png")).convert("RGBA"), 306)
        idle = body_frame(idle, phase, breathe=1.0)
        loops.setdefault("idle", []).append(idle)

    for name, frames in loops.items():
        folder = os.path.join(out_dir, name)
        os.makedirs(folder, exist_ok=True)
        for old in os.listdir(folder):
            if old.endswith(".png"):
                os.remove(os.path.join(folder, old))
        for i, frame in enumerate(frames):
            frame.save(os.path.join(folder, f"{i:03d}.png"))
    print("wrote", ", ".join(f"{len(v)} {k}" for k, v in loops.items()), "->", out_dir)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
