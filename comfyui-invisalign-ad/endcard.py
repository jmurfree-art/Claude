#!/usr/bin/env python3
"""Render the 1080x1920 brand endcard for the final beat of the spot."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
TEAL_DEEP = (12, 74, 74)
TEAL_DARK = (9, 58, 58)
CREAM = (247, 242, 232)
CORAL = (233, 137, 115)
MUTED = (170, 200, 196)

FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans%s.ttf",
]


def font(size, bold=False):
    suffix = "-Bold" if bold else ""
    for pattern in FONT_DIRS:
        try:
            return ImageFont.truetype(pattern % suffix, size)
        except OSError:
            continue
    return ImageFont.load_default()


def center(draw, y, text, f, fill, tracking=0):
    if tracking:
        text = (" " * 1).join(text)  # simple letterspacing via thin joins
    w = draw.textlength(text, font=f)
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)
    return y


img = Image.new("RGB", (W, H), TEAL_DEEP)
d = ImageDraw.Draw(img)

# subtle vertical gradient: deep teal -> slightly darker at bottom
for y in range(H):
    t = y / H
    r = int(TEAL_DEEP[0] + (TEAL_DARK[0] - TEAL_DEEP[0]) * t)
    g = int(TEAL_DEEP[1] + (TEAL_DARK[1] - TEAL_DEEP[1]) * t)
    b = int(TEAL_DEEP[2] + (TEAL_DARK[2] - TEAL_DEEP[2]) * t)
    d.line([(0, y), (W, y)], fill=(r, g, b))

# faint oversized smile arc as background motif
arc_box = [-350, H * 0.30, W + 350, H * 1.12]
d.arc(arc_box, start=205, end=335, fill=(22, 96, 94), width=26)

# coral keystone rule
rule_w = 150
d.rectangle([(W - rule_w) / 2, 645, (W + rule_w) / 2, 655], fill=CORAL)

# type stack
center(d, 705, "M U R F R E E", font(112, bold=True), CREAM)
center(d, 835, "D E N T A L", font(112, bold=True), CREAM)
center(d, 1010, "Invisalign® Provider", font(58), CORAL)
center(d, 1092, "Murfreesboro, Tennessee", font(44), MUTED)

# CTA block
d.rectangle([(W - rule_w) / 2, 1268, (W + rule_w) / 2, 1274], fill=(38, 116, 112))
center(d, 1320, "Schedule your consultation", font(46), CREAM)
center(d, 1400, "murfreedental.com", font(60, bold=True), CREAM)
center(d, 1495, "(615) 893-1770", font(46), MUTED)

img.save(__file__.rsplit("/", 1)[0] + "/endcard.png")
print("wrote endcard.png")
