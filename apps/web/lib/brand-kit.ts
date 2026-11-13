import type { BrandKit } from '@hostels/shared';

/** Print files for verified partners, drawn as SVG so a print shop can scale them to any size. */
export const BRAND_FILES = {
  signboard: { label: 'Signboard', size: '6 × 2 ft, landscape', width: 1800, height: 600 },
  poster: { label: 'Reception poster', size: 'A4, portrait', width: 1240, height: 1754 },
  sticker: { label: 'Door sticker', size: '8 cm round', width: 800, height: 800 },
} as const;
export type BrandFile = keyof typeof BRAND_FILES;

const GREEN = '#1F5C46';
const GREEN_DARK = '#164434';
const CREAM = '#FAF7F2';
const ORANGE = '#E08A2E';
// Devanagari names need a font that has the script: Noto (Android, Linux, print shops), Nirmala UI (Windows),
// Kohinoor (macOS). Latin text keeps Inter first.
const FONT = "Inter, 'Noto Sans', 'Noto Sans Devanagari', 'Nirmala UI', 'Kohinoor Devanagari', 'Mukta', 'Segoe UI', Roboto, Arial, sans-serif";

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Width of `text` in em, estimated per grapheme cluster (what a reader sees as one letter): a Devanagari consonant
 * with its vowel signs is one cluster. Bold Inter averages about 0.58em a letter, capitals and wide letters more;
 * Devanagari clusters run wider. Deliberately generous, so text never runs off the board.
 */
export function emWidth(text: string): number {
  let w = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (segment === ' ') w += 0.28;
    else if (DEVANAGARI.test(segment)) w += 0.78;
    else if (/[MW@%&]/.test(segment)) w += 0.92;
    else if (/[A-Z0-9]/.test(segment)) w += 0.7;
    else if (/[iljtfr.,'’:;!|]/.test(segment)) w += 0.34;
    else w += 0.58;
  }
  return w;
}

/** The split of `words` into `n` lines whose widest line is narrowest (names are at most 80 characters). */
function balance(words: string[], n: number): string[] {
  if (n <= 1 || words.length <= 1) return [words.join(' ')];
  let best: string[] = [words.join(' ')];
  let bestWidth = Number.POSITIVE_INFINITY;
  const split = (from: number, left: number): string[][] => {
    if (left === 1) return [[words.slice(from).join(' ')]];
    const out: string[][] = [];
    for (let i = from + 1; i <= words.length - left + 1; i++) {
      for (const rest of split(i, left - 1)) out.push([words.slice(from, i).join(' '), ...rest]);
    }
    return out;
  };
  for (const lines of split(0, Math.min(n, words.length))) {
    const widest = Math.max(...lines.map(emWidth));
    if (widest < bestWidth) {
      best = lines;
      bestWidth = widest;
    }
  }
  return best;
}

/** `fit`: none, or held to the box by letter spacing (a line at the edge) or by squeezing letters (too long to fit). */
export type NameLayout = { lines: string[]; size: number; fit: 'none' | 'spacing' | 'spacingAndGlyphs' };

/**
 * How a name fits a box: as large as `max`, on one line if it can stay at least `min`, otherwise wrapped at spaces
 * (never inside a word or a letter) onto up to `maxLines` lines. A line that reaches the edge is held to the box
 * (`textLength`), so a font wider than the estimate tightens its spacing instead of running off the print.
 */
export function layoutName(name: string, box: { width: number; height: number; max: number; min: number; maxLines: number }): NameLayout {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let best: NameLayout | null = null;
  for (let n = 1; n <= Math.min(box.maxLines, Math.max(1, words.length)); n++) {
    const lines = balance(words, n);
    const widest = Math.max(...lines.map(emWidth), 0.1);
    const size = Math.floor(Math.min(box.max, box.width / widest, box.height / (0.8 + 1.15 * (lines.length - 1))));
    const layout: NameLayout = { lines, size, fit: widest * size > box.width * 0.95 ? 'spacing' : 'none' };
    if (size >= box.min) return layout;
    if (!best || size > best.size) best = layout;
  }
  // Too long even wrapped: the largest size found, held to the box so nothing runs off.
  return { ...best!, fit: 'spacingAndGlyphs' };
}

/** The name as an SVG <text>, one <tspan> per line, centred in the box vertically. */
function nameText(
  name: string,
  at: { x: number; top: number; bottom: number; width: number; max: number; min: number; maxLines: number; anchor: 'start' | 'middle'; fill: string; weight: number },
) {
  const box = { width: at.width, height: at.bottom - at.top, max: at.max, min: at.min, maxLines: at.maxLines };
  const { lines, size, fit } = layoutName(name, box);
  const block = size * (0.8 + 1.15 * (lines.length - 1));
  const first = at.top + (box.height - block) / 2 + size * 0.8;
  const lang = DEVANAGARI.test(name) ? ' xml:lang="hi"' : '';
  const spans = lines
    .map((line, i) => {
      const held = fit !== 'none' && emWidth(line) * size > at.width * 0.95;
      const length = held ? ` textLength="${Math.round(Math.min(emWidth(line) * size, at.width))}" lengthAdjust="${fit}"` : '';
      return `<tspan x="${at.x}" y="${Math.round(first + i * size * 1.15)}"${length}>${esc(line)}</tspan>`;
    })
    .join('');
  return `<text${lang} fill="${at.fill}" font-size="${size}" font-weight="${at.weight}" text-anchor="${at.anchor}">${spans}</text>`;
}

function mark(x: number, y: number, size: number) {
  // A roof over a check: the Hostels verified mark.
  const s = size / 100;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="50" cy="50" r="50" fill="${CREAM}"/>
    <path d="M18 52 L50 24 L82 52" fill="none" stroke="${GREEN}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M34 60 L46 72 L68 48" fill="none" stroke="${ORANGE}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

const sinceText = (kit: BrandKit) => {
  if (!kit.partnerSince) return 'Verified partner';
  const d = new Date(`${kit.partnerSince}T00:00:00Z`);
  return `Verified partner since ${d.toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
};

/** A single line that shrinks to fit its width (places and links have no good place to wrap). */
function fitSize(text: string, width: number, max: number) {
  return Math.max(12, Math.min(max, Math.floor(width / Math.max(emWidth(text), 0.1))));
}

export function brandSvg(kit: BrandKit, file: BrandFile): string {
  const { width: w, height: h } = BRAND_FILES[file];
  const place = `${kit.area}, ${kit.city}`;
  const url = kit.listingUrl.replace(/^https?:\/\//, '');
  const phone = esc(`+91 ${kit.contactPhone}`);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">`;

  if (file === 'signboard') {
    const name = nameText(kit.name, { x: 380, top: 240, bottom: 380, width: w - 450, max: 130, min: 64, maxLines: 2, anchor: 'start', fill: '#FFFFFF', weight: 700 });
    return `${open}
  <rect width="${w}" height="${h}" fill="${GREEN}"/>
  <rect x="0" y="${h - 90}" width="${w}" height="90" fill="${GREEN_DARK}"/>
  ${mark(70, 120, 260)}
  <text x="380" y="215" fill="${CREAM}" font-size="44" font-weight="600" letter-spacing="6">HOSTELS · VERIFIED PARTNER</text>
  ${name}
  <text x="380" y="440" fill="${CREAM}" font-size="${fitSize(place, w - 450, 46)}">${esc(place)}</text>
  <text x="70" y="${h - 32}" fill="${CREAM}" font-size="40">${esc(kit.tagline)}</text>
  <text x="${w - 70}" y="${h - 32}" fill="${ORANGE}" font-size="40" font-weight="600" text-anchor="end">${phone}</text>
</svg>`;
  }

  if (file === 'poster') {
    const name = nameText(kit.name, { x: w / 2, top: 670, bottom: 820, width: w - 160, max: 110, min: 56, maxLines: 2, anchor: 'middle', fill: GREEN_DARK, weight: 700 });
    return `${open}
  <rect width="${w}" height="${h}" fill="${CREAM}"/>
  <rect width="${w}" height="620" fill="${GREEN}"/>
  ${mark(w / 2 - 150, 90, 300)}
  <text x="${w / 2}" y="500" fill="${CREAM}" font-size="46" font-weight="600" letter-spacing="6" text-anchor="middle">HOSTELS · VERIFIED PARTNER</text>
  ${name}
  <text x="${w / 2}" y="880" fill="#4B5550" font-size="${fitSize(place, w - 160, 44)}" text-anchor="middle">${esc(place)}</text>
  <g font-size="38" fill="#1C2421">
    <text x="160" y="1040">✓  No advance. One monthly bill for bed and food.</text>
    <text x="160" y="1120">✓  Move to any partner hostel, anytime.</text>
    <text x="160" y="1200">✓  Skip a meal before the cut-off, get credit.</text>
    <text x="160" y="1280">✓  Report issues in the app. Replies are tracked.</text>
  </g>
  <rect x="120" y="1400" width="${w - 240}" height="200" rx="28" fill="${GREEN}"/>
  <text x="${w / 2}" y="1478" fill="${CREAM}" font-size="40" text-anchor="middle">Reviews from verified residents only</text>
  <text x="${w / 2}" y="1550" fill="#FFFFFF" font-size="${fitSize(url, w - 320, 44)}" font-weight="600" text-anchor="middle">${esc(url)}</text>
  <text x="${w / 2}" y="1680" fill="#646D68" font-size="34" text-anchor="middle">${esc(sinceText(kit))} · ${phone}</text>
</svg>`;
  }

  const name = nameText(kit.name, { x: w / 2, top: 575, bottom: 690, width: 500, max: 44, min: 26, maxLines: 3, anchor: 'middle', fill: ORANGE, weight: 600 });
  return `${open}
  <circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 4}" fill="${GREEN}"/>
  <circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 40}" fill="none" stroke="${CREAM}" stroke-width="6"/>
  ${mark(w / 2 - 130, 130, 260)}
  <text x="${w / 2}" y="470" fill="#FFFFFF" font-size="64" font-weight="700" text-anchor="middle">VERIFIED</text>
  <text x="${w / 2}" y="540" fill="${CREAM}" font-size="40" letter-spacing="6" text-anchor="middle">HOSTELS PARTNER</text>
  ${name}
</svg>`;
}

/**
 * The download name: plain ASCII for old browsers (`hostel-signboard.svg` when the name has no Latin letters, such
 * as a Devanagari name), and the full name in UTF-8 for the rest (RFC 6266 `filename*`).
 */
export function brandFileName(name: string, file: BrandFile) {
  const ascii = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hostel'}-${file}.svg`;
  const unicode = `${name.trim().replace(/[\s/\\:*?"<>|]+/g, '-')}-${file}.svg`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(unicode)}`;
}
