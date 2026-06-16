"""
gen_placeholders.py
-------------------------------------------------------------------------------
Generates a stable set of ORIGINAL placeholder art for ArrowTowerGuard, sized
for a WeChat mini-game. Re-run any time; it only writes PNGs (Cocos regenerates
the .meta on import). Style: flat original cartoon, consistent palette pulled
from GameConfig colors. Characters / monsters / arrow / UI / FX use transparent
backgrounds; only the field + ground backgrounds are opaque.

Replace any PNG later with a same-named file of the same size — no code changes.
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "resources", "art")
S = 4  # supersample factor for smooth (anti-aliased) edges

# --- palette (mirrors GameConfig.colors / monsters) -------------------------
P = {
    "sky_top": (58, 48, 86),      # dusk purple
    "sky_mid": (150, 92, 96),
    "sky_low": (224, 150, 80),    # warm horizon
    "field":   (58, 74, 46),      # #3a4a2e
    "ground":  (44, 58, 34),      # #2c3a22
    "ground_dark": (32, 42, 24),
    "grass":   (111, 174, 84),    # #6fae54
    "castle":  (125, 125, 133),   # #7d7d85
    "castle_dark": (92, 92, 100),
    "tower":   (154, 154, 162),   # #9a9aa2
    "hero":    (216, 196, 90),    # #d8c45a
    "arrow":   (232, 224, 192),   # #e8e0c0
    "wood":    (122, 84, 48),
    "goblin":  (111, 174, 84),    # #6fae54
    "bat":     (122, 79, 176),    # #7a4fb0
    "brute":   (138, 90, 43),     # #8a5a2b
    "overlord":(176, 48, 48),     # #b03030
    "button":  (74, 90, 58),      # #4a5a3a
    "button_pressed": (54, 66, 42),
    "coin":    (255, 210, 63),    # #ffd23f
    "coin_dark": (212, 160, 30),
    "white":   (255, 255, 255),
    "outline": (28, 26, 22),
}


def canvas(w, h):
    img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def save(img, w, h, *path):
    out = img.resize((w, h), Image.LANCZOS)
    fp = os.path.normpath(os.path.join(ROOT, *path))
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    out.save(fp, "PNG", optimize=True)
    print(f"  {os.path.relpath(fp, ROOT).replace(os.sep, '/'):28s} {w}x{h}")


def s(v):
    return v * S


def outline_ellipse(d, box, fill, ow=3):
    d.ellipse(box, fill=fill, outline=P["outline"], width=s(ow))


def outline_rrect(d, box, r, fill, ow=3):
    d.rounded_rectangle(box, radius=s(r), fill=fill, outline=P["outline"], width=s(ow))


# ---------------------------------------------------------------------------
# Backgrounds (opaque)
# ---------------------------------------------------------------------------
def gen_field(w, h):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    horizon = int(h * 0.62)
    # sky gradient (purple -> warm)
    for y in range(horizon):
        t = y / horizon
        if t < 0.5:
            k = t / 0.5
            c = tuple(int(P["sky_top"][i] + (P["sky_mid"][i] - P["sky_top"][i]) * k) for i in range(3))
        else:
            k = (t - 0.5) / 0.5
            c = tuple(int(P["sky_mid"][i] + (P["sky_low"][i] - P["sky_mid"][i]) * k) for i in range(3))
        d.line([(0, y), (w, y)], fill=c + (255,))
    # distant hills
    d.polygon([(0, horizon), (w * 0.30, horizon - 70), (w * 0.55, horizon),
               (w, horizon - 40), (w, horizon)], fill=(70, 66, 92, 255))
    # field
    for y in range(horizon, h):
        t = (y - horizon) / (h - horizon)
        c = tuple(int(P["field"][i] + (P["ground"][i] - P["field"][i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c + (255,))
    return img


def gen_ground(w, h):
    img = Image.new("RGBA", (w, h), P["ground"] + (255,))
    d = ImageDraw.Draw(img)
    # grass top edge
    d.rectangle([0, 0, w, int(h * 0.22)], fill=P["grass"] + (255,))
    d.rectangle([0, int(h * 0.22), w, int(h * 0.30)], fill=P["ground_dark"] + (255,))
    # a few dirt speckles
    for x in range(0, w, 90):
        d.ellipse([x, h * 0.55, x + 26, h * 0.55 + 14], fill=P["ground_dark"] + (255,))
    return img


# ---------------------------------------------------------------------------
# Tower group
# ---------------------------------------------------------------------------
def gen_castle(w, h):
    img, d = canvas(w, h)
    bw, bh = w * 0.78, h * 0.60
    bx, by = (w - bw) / 2, h - bh
    # body
    outline_rrect(d, [s(bx), s(by), s(bx + bw), s(by + bh)], 4, P["castle"])
    # battlements
    cw = bw / 5
    for i in range(0, 5, 2):
        x = bx + i * cw
        d.rectangle([s(x), s(by - h * 0.10), s(x + cw), s(by + 2)], fill=P["castle"] + (255,),
                    outline=P["outline"], width=s(3))
    # door
    dw, dh = bw * 0.34, bh * 0.55
    dx = (w - dw) / 2
    d.rounded_rectangle([s(dx), s(h - dh), s(dx + dw), s(h)], radius=s(dw / 2),
                        fill=P["castle_dark"] + (255,), outline=P["outline"], width=s(3))
    # brick lines
    for yy in range(1, 4):
        d.line([(s(bx), s(by + bh * yy / 4)), (s(bx + bw), s(by + bh * yy / 4))],
               fill=P["castle_dark"] + (255,), width=s(2))
    # flag
    d.line([(s(w / 2), s(by - h * 0.10)), (s(w / 2), s(by - h * 0.30))], fill=P["wood"] + (255,), width=s(3))
    d.polygon([(s(w / 2), s(by - h * 0.30)), (s(w / 2 + w * 0.16), s(by - h * 0.25)),
               (s(w / 2), s(by - h * 0.19))], fill=P["overlord"] + (255,))
    return img


def gen_archer(w, h):
    img, d = canvas(w, h)
    cx = w / 2
    # body
    outline_rrect(d, [s(cx - w * 0.16), s(h * 0.42), s(cx + w * 0.16), s(h * 0.84)], 6, P["hero"])
    # head
    outline_ellipse(d, [s(cx - w * 0.15), s(h * 0.14), s(cx + w * 0.15), s(h * 0.46)], P["hero"])
    # hood/cap
    d.pieslice([s(cx - w * 0.17), s(h * 0.10), s(cx + w * 0.17), s(h * 0.40)], 180, 360,
               fill=P["button"] + (255,), outline=P["outline"], width=s(3))
    # eye
    d.ellipse([s(cx - w * 0.02), s(h * 0.27), s(cx + w * 0.05), s(h * 0.34)], fill=P["outline"] + (255,))
    # bow
    d.arc([s(cx + w * 0.08), s(h * 0.30), s(cx + w * 0.40), s(h * 0.80)], 300, 60,
          fill=P["wood"] + (255,), width=s(4))
    return img


def gen_arrow(w, h):
    img, d = canvas(w, h)
    midy = h / 2
    # shaft
    d.line([(s(w * 0.10), s(midy)), (s(w * 0.78), s(midy))], fill=P["arrow"] + (255,), width=s(4))
    # head
    d.polygon([(s(w * 0.74), s(midy - h * 0.32)), (s(w), s(midy)), (s(w * 0.74), s(midy + h * 0.32))],
              fill=P["castle"] + (255,), outline=P["outline"], width=s(2))
    # fletching
    d.polygon([(s(w * 0.10), s(midy)), (s(0), s(midy - h * 0.34)), (s(w * 0.18), s(midy))],
              fill=P["overlord"] + (255,))
    d.polygon([(s(w * 0.10), s(midy)), (s(0), s(midy + h * 0.34)), (s(w * 0.18), s(midy))],
              fill=P["overlord"] + (255,))
    return img


# ---------------------------------------------------------------------------
# Enemies
# ---------------------------------------------------------------------------
def _eyes(d, cx, ey, r, w):
    for sx in (-1, 1):
        d.ellipse([s(cx + sx * w * 0.16 - r), s(ey - r), s(cx + sx * w * 0.16 + r), s(ey + r)],
                  fill=P["white"] + (255,), outline=P["outline"], width=s(2))
        d.ellipse([s(cx + sx * w * 0.16 - r * 0.45), s(ey - r * 0.45),
                   s(cx + sx * w * 0.16 + r * 0.45), s(ey + r * 0.45)], fill=P["outline"] + (255,))


def gen_goblin(w, h):
    img, d = canvas(w, h)
    cx = w / 2
    outline_rrect(d, [s(cx - w * 0.28), s(h * 0.40), s(cx + w * 0.28), s(h * 0.92)], 10, P["goblin"])
    outline_ellipse(d, [s(cx - w * 0.30), s(h * 0.08), s(cx + w * 0.30), s(h * 0.52)], P["goblin"])
    # ears
    for sx in (-1, 1):
        d.polygon([(s(cx + sx * w * 0.28), s(h * 0.22)), (s(cx + sx * w * 0.46), s(h * 0.14)),
                   (s(cx + sx * w * 0.30), s(h * 0.36))], fill=P["goblin"] + (255,),
                  outline=P["outline"], width=s(2))
    _eyes(d, cx, h * 0.30, w * 0.05, w)
    return img


def gen_bat(w, h):
    img, d = canvas(w, h)
    cx = w / 2
    outline_ellipse(d, [s(cx - w * 0.16), s(h * 0.30), s(cx + w * 0.16), s(h * 0.78)], P["bat"])
    # wings
    for sx in (-1, 1):
        d.polygon([(s(cx), s(h * 0.42)), (s(cx + sx * w * 0.48), s(h * 0.22)),
                   (s(cx + sx * w * 0.42), s(h * 0.52)), (s(cx + sx * w * 0.48), s(h * 0.62)),
                   (s(cx + sx * w * 0.12), s(h * 0.60))], fill=P["bat"] + (255,),
                  outline=P["outline"], width=s(2))
    _eyes(d, cx, h * 0.48, w * 0.035, w)
    return img


def gen_brute(w, h):
    img, d = canvas(w, h)
    cx = w / 2
    outline_rrect(d, [s(cx - w * 0.34), s(h * 0.36), s(cx + w * 0.34), s(h * 0.94)], 12, P["brute"])
    # armor plate
    outline_rrect(d, [s(cx - w * 0.24), s(h * 0.46), s(cx + w * 0.24), s(h * 0.72)], 6, P["castle"])
    outline_ellipse(d, [s(cx - w * 0.26), s(h * 0.06), s(cx + w * 0.26), s(h * 0.46)], P["brute"])
    # helmet brow
    d.rectangle([s(cx - w * 0.26), s(h * 0.18), s(cx + w * 0.26), s(h * 0.26)],
                fill=P["castle_dark"] + (255,))
    _eyes(d, cx, h * 0.32, w * 0.045, w)
    return img


def gen_overlord(w, h):
    img, d = canvas(w, h)
    cx = w / 2
    outline_rrect(d, [s(cx - w * 0.32), s(h * 0.34), s(cx + w * 0.32), s(h * 0.94)], 14, P["overlord"])
    outline_ellipse(d, [s(cx - w * 0.26), s(h * 0.08), s(cx + w * 0.26), s(h * 0.46)], P["overlord"])
    # horns
    for sx in (-1, 1):
        d.polygon([(s(cx + sx * w * 0.22), s(h * 0.14)), (s(cx + sx * w * 0.40), s(h * 0.00)),
                   (s(cx + sx * w * 0.28), s(h * 0.18))], fill=(40, 30, 30, 255),
                  outline=P["outline"], width=s(2))
    # cape shoulders
    d.polygon([(s(cx - w * 0.32), s(h * 0.40)), (s(cx - w * 0.46), s(h * 0.64)),
               (s(cx - w * 0.30), s(h * 0.58))], fill=(60, 20, 20, 255))
    d.polygon([(s(cx + w * 0.32), s(h * 0.40)), (s(cx + w * 0.46), s(h * 0.64)),
               (s(cx + w * 0.30), s(h * 0.58))], fill=(60, 20, 20, 255))
    _eyes(d, cx, h * 0.28, w * 0.04, w)
    return img


# ---------------------------------------------------------------------------
# UI + FX
# ---------------------------------------------------------------------------
def gen_button(w, h, color):
    img, d = canvas(w, h)
    pad = h * 0.12
    outline_rrect(d, [s(pad), s(pad), s(w - pad), s(h - pad)], 16, color, ow=3)
    # top highlight strip
    d.rounded_rectangle([s(pad + 6), s(pad + 5), s(w - pad - 6), s(h * 0.40)], radius=s(12),
                        fill=(255, 255, 255, 38))
    return img


def gen_coin(w, h):
    img, d = canvas(w, h)
    m = w * 0.10
    outline_ellipse(d, [s(m), s(m), s(w - m), s(h - m)], P["coin"], ow=3)
    outline_ellipse(d, [s(w * 0.24), s(h * 0.24), s(w * 0.76), s(h * 0.76)], P["coin_dark"], ow=2)
    # star
    import math
    cx, cy, ro, ri = w / 2, h / 2, w * 0.18, w * 0.08
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = ro if i % 2 == 0 else ri
        pts.append((s(cx + rr * math.cos(ang)), s(cy + rr * math.sin(ang))))
    d.polygon(pts, fill=P["coin"] + (255,))
    return img


def gen_hit(w, h):
    img, d = canvas(w, h)
    import math
    cx, cy = w / 2, h / 2
    pts = []
    for i in range(16):
        ang = i * math.pi / 8
        rr = w * 0.46 if i % 2 == 0 else w * 0.20
        pts.append((s(cx + rr * math.cos(ang)), s(cy + rr * math.sin(ang))))
    d.polygon(pts, fill=(255, 236, 150, 235), outline=(255, 180, 60, 255), width=s(2))
    d.ellipse([s(cx - w * 0.14), s(cy - h * 0.14), s(cx + w * 0.14), s(cy + h * 0.14)],
              fill=(255, 255, 255, 235))
    return img


# ---------------------------------------------------------------------------
def main():
    print("Generating placeholders ->", os.path.normpath(ROOT))
    save(gen_field(1280, 720), 1280, 720, "background", "field.png")
    save(gen_ground(1280, 160), 1280, 160, "background", "ground.png")

    save(gen_castle(192, 320), 192, 320, "tower", "castle.png")
    save(gen_archer(64, 64), 64, 64, "tower", "archer.png")
    save(gen_arrow(96, 24), 96, 24, "tower", "arrow.png")

    save(gen_goblin(128, 160), 128, 160, "enemy", "goblin.png")
    save(gen_bat(128, 96), 128, 96, "enemy", "bat.png")
    save(gen_brute(192, 256), 192, 256, "enemy", "brute.png")
    save(gen_overlord(256, 320), 256, 320, "enemy", "overlord.png")

    save(gen_button(256, 96, P["button"]), 256, 96, "ui", "button_normal.png")
    save(gen_button(256, 96, P["button_pressed"]), 256, 96, "ui", "button_pressed.png")
    save(gen_coin(64, 64), 64, 64, "ui", "icon_coin.png")

    save(gen_hit(64, 64), 64, 64, "effects", "hit.png")
    print("Done.")


if __name__ == "__main__":
    main()
