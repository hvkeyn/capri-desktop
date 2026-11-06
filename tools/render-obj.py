"""Renders a Wavefront OBJ (one group per part) to a flat PNG with its textures.

Made for the character bundles of Desktop Girlfriend NEO: `tools/export-char.py` writes the OBJ out of
a .char file, this one paints it. Orthographic, unlit, albedo only, with the axis pair you pick —
a 3D model has no single "front", so render a few and keep the one that looks like a figure.
"""
import os
import sys
import numpy as np
from PIL import Image

FLAT = (150, 150, 160, 255)


def load_obj(path):
    verts, uvs, groups = [], [], []
    cur = None
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("v "):
                _, x, y, z = line.split()[:4]
                verts.append((float(x), float(y), float(z)))
            elif line.startswith("vt "):
                parts = line.split()
                uvs.append((float(parts[1]), float(parts[2])))
            elif line.startswith(("o ", "g ")):
                name = line[2:].strip()
                cur = {"name": name, "faces": []}
                groups.append(cur)
            elif line.startswith("f ") and cur is not None:
                idx = []
                uv = []
                for token in line.split()[1:]:
                    bits = token.split("/")
                    v = int(bits[0])
                    idx.append(v - 1 if v > 0 else len(verts) + v)
                    uv.append(int(bits[1]) - 1 if len(bits) > 1 and bits[1] else -1)
                cur["faces"].append((idx, uv))
    return np.array(verts, dtype=np.float64), np.array(uvs, dtype=np.float64) if uvs else None, groups


def textures(folder):
    out = {}
    if not folder or not os.path.isdir(folder):
        return out
    for name in os.listdir(folder):
        if name.lower().endswith((".png", ".jpg")):
            key = os.path.splitext(name)[0].lower()
            if not key.endswith("_n") and not key.endswith("_n2"):
                out[key] = Image.open(os.path.join(folder, name)).convert("RGBA")
    return out


def pick_texture(name, texs):
    key = name.lower()
    if key in texs:
        return texs[key]
    for k in sorted(texs, key=len, reverse=True):
        if key.startswith(k):
            return texs[k]
    return None


def render(verts, uvs, groups, texs, axis_a, axis_b, depth_axis, width=900, flip_b=True, flip_depth=False):
    a = verts[:, axis_a]
    b = verts[:, axis_b]
    d = verts[:, depth_axis]
    lo = np.array([a.min(), b.min()])
    hi = np.array([a.max(), b.max()])
    span = np.maximum(hi - lo, 1e-9)
    scale = (width * 0.72) / span[0]
    W = int(np.ceil(span[0] * scale)) + 24
    H = int(np.ceil(span[1] * scale)) + 24
    color = np.zeros((H, W, 4), dtype=np.float32)
    depth = np.full((H, W), -np.inf if not flip_depth else np.inf, dtype=np.float64)

    pa = (a - lo[0]) * scale + 12
    pb = (b - lo[1]) * scale + 12
    if flip_b:
        pb = H - 12 - (b - lo[1]) * scale

    for g in groups:
        tex = pick_texture(g["name"], texs)
        if tex is not None:
            tarr = np.asarray(tex.convert("RGBA"), dtype=np.float32) / 255.0
            th, tw = tarr.shape[:2]
        else:
            tarr = None
        for idx, uvidx in g["faces"]:
            if len(idx) < 3:
                continue
            for k in range(1, len(idx) - 1):
                tri = (idx[0], idx[k], idx[k + 1])
                tv = (uvidx[0], uvidx[k], uvidx[k + 1])
                x0, x1, x2 = pa[tri[0]], pa[tri[1]], pa[tri[2]]
                y0, y1, y2 = pb[tri[0]], pb[tri[1]], pb[tri[2]]
                minx = int(max(0, np.floor(min(x0, x1, x2))))
                maxx = int(min(W - 1, np.ceil(max(x0, x1, x2))))
                miny = int(max(0, np.floor(min(y0, y1, y2))))
                maxy = int(min(H - 1, np.ceil(max(y0, y1, y2))))
                if minx > maxx or miny > maxy:
                    continue
                den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
                if abs(den) < 1e-9:
                    continue
                ys, xs = np.mgrid[miny:maxy + 1, minx:maxx + 1]
                px = xs + 0.5
                py = ys + 0.5
                w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den
                w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den
                w2 = 1.0 - w0 - w1
                inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
                if not inside.any():
                    continue
                zoom = w0 * d[tri[0]] + w1 * d[tri[1]] + w2 * d[tri[2]]
                win = color[miny:maxy + 1, minx:maxx + 1]
                near = depth[miny:maxy + 1, minx:maxx + 1]
                closer = (zoom < near) if flip_depth else (zoom > near)
                vis = inside & closer
                if not vis.any():
                    continue
                if tarr is not None and uvs is not None and all(t >= 0 for t in tv):
                    u = w0 * uvs[tv[0]][0] + w1 * uvs[tv[1]][0] + w2 * uvs[tv[2]][0]
                    v = w0 * uvs[tv[0]][1] + w1 * uvs[tv[1]][1] + w2 * uvs[tv[2]][1]
                    tx = np.clip((u % 1.0) * (tw - 1), 0, tw - 1).astype(np.int32)
                    ty = np.clip((1.0 - (v % 1.0)) * (th - 1), 0, th - 1).astype(np.int32)
                    sample = tarr[ty, tx]
                    alpha = sample[..., 3]
                    keep = vis & (alpha > 0.35)
                    win[keep] = sample[keep]
                    near[keep] = zoom[keep]
                else:
                    win[vis] = np.array(FLAT, dtype=np.float32) / 255.0
                    near[vis] = zoom[vis]

    img = Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8), "RGBA")
    box = img.getbbox()
    return img.crop(box) if box else img


if __name__ == "__main__":
    obj, out, texdir = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else None)
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 900
    # the model is Z-up (its height is the Z extent): front view is (x, z), depth along y, two ways
    candidates = [(0, 2, 1, False), (0, 2, 1, True), (2, 0, 1, False), (2, 0, 1, True)]
    verts, uvs, groups = load_obj(obj)
    texs = textures(texdir)
    print(f"vertices {len(verts)} groups {len(groups)} textures {len(texs)}")
    for i, (a, b, dep, flip) in enumerate(candidates):
        img = render(verts, uvs, groups, texs, a, b, dep, width, flip_depth=flip)
        path = out.replace(".png", f"-{i}.png")
        img.save(path)
        print(f"axis ({'xyz'[a]},{'xyz'[b]}) depth {'xyz'[dep]} flip={flip} -> {path} {img.width}x{img.height}")
