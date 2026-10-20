"""Generates build/icon.ico and build/icon.png (stopwatch on a purple-pink gradient).

Run: python build/make_icon.py
Small sizes (<= 32px) are drawn with thicker strokes so the shape stays readable.
"""
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
S = 1024  # master canvas; each size is drawn at 4x and downscaled
TOP = (139, 92, 246)     # violet
BOTTOM = (219, 39, 119)  # pink
WHITE = (255, 255, 255, 255)


def gradient(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.35 + y * 0.65) / size
            px[x, y] = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)) + (255,)
    return img


def draw_icon(size, bold):
    c = size * 4
    u = c / 100  # 1 unit = 1% of the canvas
    mask = Image.new("L", (c, c), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, c - 1, c - 1], radius=22 * u, fill=255)
    img = gradient(c)
    img.putalpha(mask)
    d = ImageDraw.Draw(img)

    ring = (11 if bold else 7.5) * u
    cx, cy, r = 50 * u, 56 * u, (31 if bold else 30) * u

    # crown button and stem on top
    d.rounded_rectangle([cx - 10 * u, 9 * u, cx + 10 * u, 18 * u], radius=3 * u, fill=WHITE)
    d.rectangle([cx - 4.5 * u, 15 * u, cx + 4.5 * u, cy - r + 2 * u], fill=WHITE)
    # side button (top right), skipped at tiny sizes to keep it clean
    if not bold:
        ang = math.radians(-45)
        bx, by = cx + (r + 5 * u) * math.cos(ang), cy + (r + 5 * u) * math.sin(ang)
        d.ellipse([bx - 5 * u, by - 5 * u, bx + 5 * u, by + 5 * u], fill=WHITE)

    # dial ring
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=int(ring))

    # tick marks at 12/3/6/9 (large sizes only)
    if not bold:
        for k in range(4):
            a = math.radians(k * 90 - 90)
            r1, r2 = r - ring - 2 * u, r - ring - 8 * u
            d.line([cx + r1 * math.cos(a), cy + r1 * math.sin(a),
                    cx + r2 * math.cos(a), cy + r2 * math.sin(a)], fill=WHITE, width=int(3.5 * u))

    # hand pointing to ~2 o'clock, plus hub
    hw = (8 if bold else 5.5) * u
    hl = r - ring - (3 if bold else 6) * u
    a = math.radians(-50)
    d.line([cx, cy, cx + hl * math.cos(a), cy + hl * math.sin(a)], fill=WHITE, width=int(hw))
    hub = (7 if bold else 5.5) * u
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [draw_icon(s, bold=s <= 32) for s in sizes]
    frames[-1].save(os.path.join(HERE, "icon.ico"), sizes=[(s, s) for s in sizes],
                    append_images=frames[:-1])
    draw_icon(512, bold=False).save(os.path.join(HERE, "icon.png"))

    # preview sheet (not used by the build)
    sheet = Image.new("RGBA", (900, 300), (245, 245, 250, 255))
    x = 20
    for s, f in zip(sizes, frames):
        sheet.alpha_composite(f, (x, 150 - s // 2))
        x += s + 25
    dark = Image.new("RGBA", (900, 80), (32, 32, 36, 255))
    x = 20
    for s, f in zip(sizes[:5], frames[:5]):
        dark.alpha_composite(f, (x, 40 - s // 2))
        x += s + 25
    out = Image.new("RGBA", (900, 380))
    out.paste(sheet, (0, 0)); out.paste(dark, (0, 300))
    out.save(os.path.join(HERE, "icon-preview.png"))


if __name__ == "__main__":
    main()
