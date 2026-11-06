"""Crops a screenshot to what is actually drawn (non-transparent pixels), with a margin."""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
pad = int(sys.argv[3]) if len(sys.argv) > 3 else 8
im = Image.open(src).convert("RGBA")
box = im.getbbox()
if not box:
    raise SystemExit("nothing drawn")
x0, y0, x1, y1 = box
crop = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
crop.save(dst)
print(f"{dst}: {crop.width}x{crop.height} from {src}")
