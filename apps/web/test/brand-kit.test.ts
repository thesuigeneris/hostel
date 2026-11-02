import { describe, expect, test } from 'bun:test';
import type { BrandKit } from '@hostels/shared';
import { BRAND_FILES, brandFileName, brandSvg, emWidth, layoutName } from '../lib/brand-kit';

const kit = (name: string): BrandKit => ({
  hostelId: 'hst_1',
  name,
  area: 'Gachibowli',
  city: 'Hyderabad',
  contactPhone: '9876500000',
  listingUrl: 'https://hostels.example/hostels/sunrise-residency-gachibowli',
  partnerSince: '2026-09-01',
  tagline: 'Live anywhere. Eat well. No advance.',
});

/** The name's lines and font size as drawn: the <text> holding <tspan>s. */
function drawnName(svg: string) {
  const text = /<text([^>]*)font-size="(\d+)"[^>]*>((?:<tspan[^>]*>[^<]*<\/tspan>)+)<\/text>/.exec(svg);
  if (!text) throw new Error('no name block');
  const lines = [...text[3]!.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]!);
  const lengths = [...text[3]!.matchAll(/textLength="(\d+)"/g)].map((m) => Number(m[1]));
  return { attrs: text[1]!, size: Number(text[2]), lines, lengths };
}

const LONG = 'Sri Venkateswara Comforts Boys and Working Professionals Hostel near Gachibowli Flyover';
const HINDI = 'श्री साई बालाजी बॉयज़ हॉस्टल';

describe('brand kit names (owner persona O7)', () => {
  test('a short name stays on one line at full size', () => {
    const d = drawnName(brandSvg(kit('Sunrise Residency'), 'signboard'));
    expect(d.lines).toEqual(['Sunrise Residency']);
    expect(d.size).toBe(130);
    expect(d.lengths).toEqual([]);
  });

  test('a long name wraps at spaces, stays readable, and every line fits the board', () => {
    for (const file of ['signboard', 'poster', 'sticker'] as const) {
      const d = drawnName(brandSvg(kit(LONG.slice(0, 80)), file));
      expect(d.lines.length).toBeGreaterThan(1);
      expect(d.lines.join(' ')).toBe(LONG.slice(0, 80).trim());
      const width = { signboard: BRAND_FILES.signboard.width - 450, poster: BRAND_FILES.poster.width - 160, sticker: 500 }[file];
      for (const line of d.lines) expect(emWidth(line) * d.size).toBeLessThanOrEqual(width + 1);
      // Nothing smaller than a third of the full size on the big prints.
      if (file !== 'sticker') expect(d.size).toBeGreaterThanOrEqual(40);
    }
  });

  test('a Devanagari name is kept whole, marked as Hindi, and drawn with fonts that have the script', () => {
    const svg = brandSvg(kit(HINDI), 'signboard');
    const d = drawnName(svg);
    expect(d.lines.join(' ')).toBe(HINDI);
    expect(d.attrs).toContain('xml:lang="hi"');
    expect(svg).toContain("'Noto Sans Devanagari'");
    expect(svg).toContain("'Nirmala UI'");
    // Lines break only between words, never inside a letter with its vowel signs.
    for (const line of d.lines) expect(HINDI.split(' ').some((w) => line.startsWith(w))).toBe(true);
  });

  test('Devanagari letters count as one per cluster, wider than Latin ones', () => {
    // "श्री" is 4 code points but one letter as read.
    expect(emWidth('श्री')).toBeCloseTo(0.78, 2);
    expect(emWidth('a')).toBeLessThan(emWidth('बा'));
  });

  test('one very long word shrinks and is held to the width instead of wrapping inside it', () => {
    const layout = layoutName('Supercalifragilisticexpialidociouslyhostel', { width: 500, height: 115, max: 44, min: 26, maxLines: 3 });
    expect(layout.lines).toHaveLength(1);
    const d = drawnName(brandSvg(kit('Supercalifragilisticexpialidociouslyhostel'), 'sticker'));
    expect(d.lengths[0]).toBeLessThanOrEqual(500);
  });

  test('text is escaped', () => {
    const svg = brandSvg(kit('Tom & Jerry <PG> "Deluxe"'), 'poster');
    expect(svg).toContain('Tom &amp; Jerry &lt;PG&gt; &quot;Deluxe&quot;');
    expect(svg).not.toContain('<PG>');
  });

  test('download names: ASCII for every browser, the full name in UTF-8 for the rest', () => {
    expect(brandFileName('Sunrise Residency', 'poster')).toBe(
      `attachment; filename="sunrise-residency-poster.svg"; filename*=UTF-8''${encodeURIComponent('Sunrise-Residency-poster.svg')}`,
    );
    const hindi = brandFileName(HINDI, 'signboard');
    expect(hindi).toContain('filename="hostel-signboard.svg"');
    expect(decodeURIComponent(hindi.split("UTF-8''")[1]!)).toBe(`${HINDI.replace(/ /g, '-')}-signboard.svg`);
  });
});
