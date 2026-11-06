"""Builds the Johnny intro from transparent poses only: no room, no green screen, no background."""
import os
import math
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "characters", "johnny")
OUT = os.path.join(ROOT, "intro")
W, H = 240, 420


def fit(pose, height, dx=0, dy=0, alpha=255):
    box = pose.getbbox()
    if box:
        pose = pose.crop(box)
    ratio = height / pose.height
    pose = pose.resize((max(1, round(pose.width * ratio)), height), Image.LANCZOS)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sheet.alpha_composite(pose, (118 - pose.width // 2 + dx, 415 - pose.height + dy))
    if alpha < 255:
        sheet.putalpha(sheet.getchannel("A").point(lambda a: a * alpha // 255))
    return sheet


def main():
    os.makedirs(OUT, exist_ok=True)
    standing = Image.open(os.path.join(ROOT, "full.png")).convert("RGBA")
    g1 = Image.open(os.path.join(ROOT, "poses", "glasses1.png")).convert("RGBA")
    g2 = Image.open(os.path.join(ROOT, "poses", "glasses2.png")).convert("RGBA")
    g3 = Image.open(os.path.join(ROOT, "poses", "glasses3.png")).convert("RGBA")
    holo = Image.open(os.path.join(ROOT, "poses", "holo.png")).convert("RGBA")
    plan = []
    for i in range(6):
        plan.append(fit(standing, 286 + i * 4, dx=round(math.sin(i * 1.3) * 3), dy=round(math.sin(i * 1.8) * 2)))
    plan += [fit(g1, 306), fit(g1, 306), fit(g2, 306), fit(g2, 306), fit(g2, 306), fit(g3, 306), fit(g3, 306), fit(g3, 306)]
    plan += [fit(g3, 306), fit(g3, 306), fit(holo, 306, alpha=180), fit(holo, 306, alpha=60)]
    for i, frame in enumerate(plan, 1):
        frame.save(os.path.join(OUT, f"{i:02d}.png"))
    print(f"wrote {len(plan)} transparent intro frames -> {OUT}")


if __name__ == "__main__":
    main()
