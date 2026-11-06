"""Pulls the geometry and the textures out of a Unity .char bundle (Desktop Girlfriend NEO characters).

Writes an .obj (one group per part) and a folder of PNG textures next to it. A 3D model like this is not
a Capri character on its own — Capri draws a single 240x420 figure — but the OBJ is what you hand to a
real renderer (Blender, Cycles) to get one.

usage: python tools/export-char.py <character.char> <out-dir>
"""
import os
import sys
import UnityPy


def main(bundle, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    textures_dir = os.path.join(out_dir, "textures")
    os.makedirs(textures_dir, exist_ok=True)
    env = UnityPy.load(bundle)

    meshes = 0
    with open(os.path.join(out_dir, "model.obj"), "w", encoding="utf-8") as f:
        for obj in env.objects:
            if obj.type.name != "Mesh":
                continue
            try:
                data = obj.read()
                text = data.export()
            except Exception as err:
                print("skip mesh:", err)
                continue
            if not isinstance(text, str):
                continue
            f.write(f"o {getattr(data, 'm_Name', obj.path_id)}\n")
            f.write(text)
            f.write("\n")
            meshes += 1

    textures = 0
    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        try:
            img = obj.read().image
            if img is None:
                continue
            img.save(os.path.join(textures_dir, f"{obj.read().m_Name.replace('/', '_')}.png"))
            textures += 1
        except Exception as err:
            print("skip texture:", err)

    print(f"{meshes} meshes, {textures} textures -> {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
