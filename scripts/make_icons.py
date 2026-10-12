"""Generate the PWA icons in web/icons from one simple drawing.

The logo is a joint angle: a baseline, a limb, and an arc between them
(the thing Spotter measures), in the accent green on black.

Run:  python scripts/make_icons.py   (needs Pillow: pip install pillow)
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "web" / "icons"
GREEN = (50, 215, 75, 255)
BLACK = (0, 0, 0, 255)
SUPERSAMPLE = 4  # draw big, then shrink, for smooth anti-aliased edges

# Logo geometry in a 24x24 design grid (same as the inline SVG in index.html).
VERTEX, BASE_END, LIMB_END = (4, 19.5), (20, 19.5), (15, 5)
ARC_RADIUS, STROKE = 7, 2.4


def draw_logo(size, glyph_scale, rounded):
    """size: output px; glyph_scale: fraction of the icon the 24-unit grid fills."""
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(big * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=BLACK)

    unit = big * glyph_scale / 24
    offset = (big - 24 * unit) / 2
    pt = lambda p: (offset + p[0] * unit, offset + p[1] * unit)  # noqa: E731
    width = max(1, round(STROKE * unit))

    def line(a, b):
        d.line([pt(a), pt(b)], fill=GREEN, width=width)
        for end in (a, b):  # round caps
            x, y = pt(end)
            d.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=GREEN)

    line(VERTEX, BASE_END)
    line(VERTEX, LIMB_END)
    # Arc between the two lines (PIL angles are clockwise from 3 o'clock).
    limb_angle = math.degrees(math.atan2(LIMB_END[1] - VERTEX[1], LIMB_END[0] - VERTEX[0])) % 360
    cx, cy = pt(VERTEX)
    r = ARC_RADIUS * unit
    d.arc([cx - r, cy - r, cx + r, cy + r], start=limb_angle, end=360, fill=GREEN, width=width)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_logo(192, 0.62, rounded=True).save(OUT / "icon-192.png")
    draw_logo(512, 0.62, rounded=True).save(OUT / "icon-512.png")
    # Maskable icons are cropped to a circle/squircle by Android: full-bleed
    # background, logo inside the central 80% "safe zone".
    draw_logo(512, 0.5, rounded=False).save(OUT / "maskable-512.png")
    # iOS rounds the corners itself and dislikes transparency.
    draw_logo(180, 0.6, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")

    (OUT / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        '<rect width="24" height="24" rx="5.5" fill="#000"/>'
        '<g transform="translate(2.4 2.4) scale(0.8)" fill="none" stroke="#32d74b" '
        'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M4 19.5h16M4 19.5 15 5"/><path d="M11 19.5a7 7 0 0 0-2.4-5.3"/></g></svg>\n'
    )
    print(f"Icons written to {OUT}")


if __name__ == "__main__":
    main()
