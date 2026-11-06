"""Draws the placeholder art of the "johnny" character skin (240x420 figure, 256x256 face).

It is a stand-in, not the Desktop Girlfriend NEO addon: that one is a proprietary Unity player model
and cannot be shipped here. Replace full.png and face.png with your own art (any figure cut out on a
transparent background, 240x420, feet at the bottom) and the same skin.json keeps working.
"""

from PIL import Image, ImageDraw, ImageFilter

W, H = 240, 420
HAIR = (23, 22, 28, 255)
HAIR_HI = (44, 42, 52, 255)
SKIN = (217, 168, 119, 255)
SKIN_DARK = (185, 135, 92, 255)
COAT = (27, 27, 34, 255)
COAT_HI = (44, 44, 54, 255)
COAT_LO = (18, 18, 23, 255)
SILVER = (185, 190, 199, 255)
SILVER_HI = (227, 231, 236, 255)
SILVER_LO = (125, 131, 140, 255)
RED = (208, 32, 47, 255)
RED_GLOW = (255, 74, 92, 120)
BOOT = (16, 16, 20, 255)
GLASS = (13, 13, 16, 255)
LENS = (122, 18, 32, 255)


def figure():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # hair, down the back
    d.ellipse([62, 66, 170, 196], fill=HAIR)
    d.ellipse([70, 78, 162, 188], fill=HAIR_HI)
    d.ellipse([74, 84, 158, 184], fill=HAIR)

    # neck and jaw
    d.rectangle([108, 150, 126, 176], fill=SKIN_DARK)
    d.ellipse([88, 96, 146, 166], fill=SKIN)
    d.ellipse([92, 100, 142, 158], fill=SKIN)
    # cheek shadow
    d.ellipse([92, 118, 112, 160], fill=SKIN_DARK)
    d.ellipse([122, 118, 142, 160], fill=SKIN_DARK)
    d.ellipse([94, 104, 140, 152], fill=SKIN)

    # hair over the forehead and down the sides
    d.polygon([(84, 100), (148, 100), (150, 118), (140, 108), (120, 104), (100, 108), (86, 118)], fill=HAIR)
    d.polygon([(80, 96), (92, 92), (96, 150), (84, 168), (74, 150)], fill=HAIR)
    d.polygon([(140, 92), (152, 96), (162, 150), (150, 168), (142, 150)], fill=HAIR)

    # aviators with red lenses
    d.rounded_rectangle([96, 122, 118, 136], radius=4, fill=GLASS)
    d.rounded_rectangle([120, 122, 142, 136], radius=4, fill=GLASS)
    d.rounded_rectangle([98, 124, 116, 134], radius=3, fill=LENS)
    d.rounded_rectangle([122, 124, 140, 134], radius=3, fill=LENS)
    d.line([118, 128, 120, 128], fill=SILVER_LO, width=2)
    # smirk
    d.line([108, 148, 126, 146], fill=SKIN_DARK, width=2)
    # beard shadow
    d.ellipse([100, 140, 132, 160], fill=SKIN_DARK)
    d.ellipse([104, 146, 128, 158], fill=SKIN)

    # shoulders and coat
    d.polygon([(78, 172), (96, 162), (140, 162), (160, 172), (168, 250), (176, 318), (64, 318), (72, 250)], fill=COAT)
    d.polygon([(96, 166), (140, 166), (146, 232), (90, 232)], fill=COAT_HI)
    # open front: the shirt under it
    d.polygon([(112, 168), (128, 168), (132, 250), (108, 250)], fill=(226, 224, 230, 255))
    d.polygon([(114, 172), (126, 172), (128, 246), (112, 246)], fill=(206, 204, 212, 255))
    # collar
    d.polygon([(96, 162), (112, 176), (104, 186), (88, 170)], fill=COAT_LO)
    d.polygon([(140, 162), (128, 176), (136, 186), (152, 170)], fill=COAT_LO)
    # red band across the chest
    d.polygon([(92, 196), (148, 190), (150, 200), (94, 206)], fill=RED)
    # a chip on the chest
    d.rounded_rectangle([108, 210, 128, 224], radius=3, fill=(30, 30, 38, 255))
    d.rounded_rectangle([110, 212, 126, 222], radius=2, fill=RED)
    d.ellipse([112, 214, 120, 220], fill=RED_GLOW)

    # the silver arm (his left), from the shoulder down
    d.polygon([(74, 176), (92, 180), (88, 252), (70, 254)], fill=SILVER)
    d.polygon([(76, 180), (86, 183), (84, 246), (74, 248)], fill=SILVER_HI)
    d.polygon([(70, 176), (78, 178), (74, 250), (66, 248)], fill=SILVER_LO)
    # joints
    for y in (196, 218, 240):
        d.line([70, y, 90, y + 2], fill=SILVER_LO, width=2)
    # hand
    d.ellipse([64, 246, 92, 272], fill=SILVER)
    d.ellipse([68, 250, 88, 268], fill=SILVER_HI)
    # the other arm, in the coat
    d.polygon([(148, 178), (164, 182), (170, 250), (154, 252)], fill=COAT_HI)

    # legs
    d.polygon([(94, 316), (118, 316), (116, 396), (92, 396)], fill=(24, 24, 30, 255))
    d.polygon([(122, 316), (146, 316), (148, 396), (124, 396)], fill=(24, 24, 30, 255))
    d.line([118, 320, 116, 394], fill=COAT_HI, width=2)
    # boots
    d.rounded_rectangle([86, 392, 120, 418], radius=4, fill=BOOT)
    d.rounded_rectangle([120, 392, 154, 418], radius=4, fill=BOOT)
    d.rectangle([86, 392, 120, 398], fill=(36, 36, 44, 255))
    d.rectangle([120, 392, 154, 398], fill=(36, 36, 44, 255))

    # a soft glow behind him, so he reads on dark desktops
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([40, 60, 200, 360], fill=(120, 40, 60, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(24))
    return Image.alpha_composite(glow, img)


def face():
    img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([28, 24, 228, 232], fill=HAIR)
    d.ellipse([40, 36, 216, 220], fill=HAIR_HI)
    d.ellipse([46, 44, 210, 214], fill=HAIR)
    d.ellipse([64, 60, 192, 214], fill=SKIN)
    d.ellipse([70, 66, 122, 208], fill=SKIN_DARK)
    d.ellipse([134, 66, 186, 208], fill=SKIN_DARK)
    d.ellipse([74, 64, 182, 200], fill=SKIN)
    d.polygon([(52, 80), (204, 80), (208, 108), (188, 92), (128, 84), (68, 92), (48, 108)], fill=HAIR)
    d.rounded_rectangle([70, 108, 122, 132], radius=6, fill=GLASS)
    d.rounded_rectangle([134, 108, 186, 132], radius=6, fill=GLASS)
    d.rounded_rectangle([74, 111, 118, 129], radius=4, fill=LENS)
    d.rounded_rectangle([138, 111, 182, 129], radius=4, fill=LENS)
    d.line([122, 118, 134, 118], fill=SILVER_LO, width=3)
    d.ellipse([96, 150, 160, 178], fill=SKIN_DARK)
    d.ellipse([100, 154, 156, 174], fill=SKIN)
    d.line([104, 182, 152, 176], fill=(120, 78, 56, 255), width=4)
    d.line([88, 140, 86, 176], fill=SKIN_DARK, width=2)
    return img


if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "assets", "characters", "johnny")
    os.makedirs(out, exist_ok=True)
    figure().save(os.path.join(out, "full.png"))
    face().save(os.path.join(out, "face.png"))
    print("written to", out)
