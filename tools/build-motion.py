"""Builds transparent animation loops for the Johnny skin from the clean seated pose.

No room, no green screen: a fitted pose breathes, slumps or leans, and small procedural props do the
work — a cigarette with rising smoke, a guitar with a strumming hand. Every frame is transparent and
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


def cigarette(draw, phase):
    breath = math.sin(phase * 2.2)
    mouth = (128, 150)
    tip = (139, 144 + round(breath))
    draw.line([mouth, tip], fill=(235, 230, 215, 255), width=2)
    draw.ellipse((tip[0] - 2, tip[1] - 2, tip[0] + 2, tip[1] + 2), fill=(255, 120, 40, 255))
    draw.ellipse((tip[0] - 1, tip[1] - 1, tip[0] + 1, tip[1] + 1), fill=(255, 230, 160, 255))


def smoke_puffs(layer, phase):
    draw = ImageDraw.Draw(layer)
    for i in range(3):
        t = (phase / math.tau + i / 3.0) % 1.0
        x = 138 + t * 30 + math.sin(t * 6.2) * 6
        y = 146 - t * 66
        radius = 3 + t * 11
        alpha = int(95 * (1.0 - t))
        if alpha <= 2:
            continue
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(210, 215, 220, alpha))
    return layer.filter(ImageFilter.GaussianBlur(1.4))


def guitar(layer, phase):
    draw = ImageDraw.Draw(layer)
    neck_end = (48, 196)
    # two bouts and a waist: an acoustic guitar, not a drum
    lower = (110, 276, 184, 344)
    upper = (122, 240, 172, 292)
    draw.ellipse(upper, fill=(139, 78, 38, 255), outline=(225, 156, 82, 255), width=2)
    draw.ellipse(lower, fill=(139, 78, 38, 255), outline=(225, 156, 82, 255), width=2)
    draw.line([(147, 262), neck_end], fill=(64, 38, 24, 255), width=11)
    draw.line([(147, 262), neck_end], fill=(128, 78, 42, 255), width=6)
    for t in (0.22, 0.40, 0.58, 0.76):
        x = 147 + (neck_end[0] - 147) * t
        y = 262 + (neck_end[1] - 262) * t
        draw.line([(x - 4, y - 1), (x + 5, y + 2)], fill=(215, 185, 135, 230), width=1)
    draw.ellipse((136, 296, 158, 318), fill=(27, 20, 17, 255))
    draw.ellipse((140, 300, 154, 314), fill=(12, 10, 9, 255))
    draw.line([(111, 332), (178, 332)], fill=(236, 199, 146, 255), width=2)
    # strum: the hand passes across the strings twice in a bar
    t = (math.sin(phase * 2) + 1) / 2
    hand_x = 123 + t * 36
    draw.ellipse((hand_x - 9, 291, hand_x + 9, 311), fill=(93, 60, 41, 235))
    draw.ellipse((hand_x - 6, 293, hand_x + 6, 307), fill=(156, 107, 74, 235))
    flash = max(0.0, math.sin(phase * 2))
    if flash > 0.5:
        draw.line([(124, 280), (170, 330)], fill=(243, 228, 176, int(150 * flash)), width=2)
    return layer.filter(ImageFilter.GaussianBlur(0.2))


def main(skin_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    seated = Image.open(os.path.join(skin_dir, "poses", "crouch.png")).convert("RGBA")
    seated = fit(seated, 250)
    loops = {}
    for i in range(24):
        phase = i / 24 * math.tau
        smoke = body_frame(seated, phase)
        prop = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cigarette(ImageDraw.Draw(prop), phase)
        smoke.alpha_composite(smoke_puffs(prop, phase))
        loops.setdefault("smoke", []).append(smoke)

        guitar_frame = body_frame(seated, phase * 2)
        guitar_prop = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        guitar(guitar_prop, phase)
        guitar_frame.alpha_composite(guitar_prop)
        loops.setdefault("guitar", []).append(guitar_frame)

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
