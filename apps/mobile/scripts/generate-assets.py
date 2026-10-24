#!/usr/bin/env python3
"""Draws the app icon, Android adaptive icon layers, splash mark and favicon into assets/.

Brand colours come from apps/web/tailwind.config.ts (brand green, food accent).
Shapes only, no fonts or downloaded images. Needs Pillow: `bun run assets` from apps/mobile.
"""
from pathlib import Path

from PIL import Image, ImageDraw

BRAND = (0x1F, 0x5C, 0x46, 255)
FOOD = (0xE0, 0x8A, 0x2E, 255)
WHITE = (0xFF, 0xFF, 0xFF, 255)
CLEAR = (0, 0, 0, 0)

OUT = Path(__file__).resolve().parent.parent / 'assets'
SS = 4  # supersampling factor for smooth edges


def mark(draw: ImageDraw.ImageDraw, cx: float, cy: float, s: float, ink, dot) -> None:
    """A roof over an 'H' with a warm dot in the gable: the hostel mark. `s` is the mark's width."""
    stroke = s * 0.13
    r = stroke / 2
    left, right = cx - s / 2, cx + s / 2
    roof_top = cy - s * 0.52
    eave = cy - s * 0.12
    # Roof: a thick chevron with round ends.
    draw.line([(left, eave), (cx, roof_top), (right, eave)], fill=ink, width=round(stroke), joint='curve')
    for x, y in ((left, eave), (right, eave), (cx, roof_top)):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=ink)
    # H: two posts and a bar.
    post_l, post_r = cx - s * 0.30, cx + s * 0.30
    top, bottom = cy - s * 0.02, cy + s * 0.50
    draw.rounded_rectangle([post_l - r, top, post_l + r, bottom], radius=r, fill=ink)
    draw.rounded_rectangle([post_r - r, top, post_r + r, bottom], radius=r, fill=ink)
    bar_y = top + (bottom - top) * 0.48
    draw.rectangle([post_l, bar_y - r * 0.85, post_r, bar_y + r * 0.85], fill=ink)
    d = s * 0.075
    dy = cy - s * 0.20
    draw.ellipse([cx - d, dy - d, cx + d, dy + d], fill=dot)


def render(size: int, bg, mark_scale: float, ink=WHITE, dot=FOOD, rounded: float = 0.0) -> Image.Image:
    big = size * SS
    img = Image.new('RGBA', (big, big), CLEAR)
    draw = ImageDraw.Draw(img)
    if bg is not None:
        if rounded:
            draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * rounded, fill=bg)
        else:
            draw.rectangle([0, 0, big, big], fill=bg)
    mark(draw, big / 2, big / 2, big * mark_scale, ink, dot)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # Full-bleed square icon (iOS and legacy Android); the OS applies its own mask.
    render(1024, BRAND, 0.56).save(OUT / 'icon.png')
    # Adaptive icon foreground: transparent, mark inside the 66% safe zone. The background colour is in app.json.
    render(1024, None, 0.40).save(OUT / 'adaptive-icon.png')
    # Themed (monochrome) icon for Android 13+: one colour, the launcher tints it.
    render(1024, None, 0.40, dot=CLEAR).save(OUT / 'adaptive-icon-monochrome.png')
    # Splash mark, shown on the brand-green splash background.
    render(1024, None, 0.70).save(OUT / 'splash-icon.png')
    render(48, BRAND, 0.62, rounded=0.22).save(OUT / 'favicon.png')
    print(f'wrote assets to {OUT}')


if __name__ == '__main__':
    main()
