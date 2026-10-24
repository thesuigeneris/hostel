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
const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Font size that keeps a name inside a width, assuming ~0.56em per character. */
function fit(text: string, width: number, max: number) {
  return Math.min(max, Math.floor(width / (Math.max(text.length, 1) * 0.56)));
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

export function brandSvg(kit: BrandKit, file: BrandFile): string {
  const { width: w, height: h } = BRAND_FILES[file];
  const name = esc(kit.name);
  const place = esc(`${kit.area}, ${kit.city}`);
  const url = esc(kit.listingUrl.replace(/^https?:\/\//, ''));
  const phone = esc(`+91 ${kit.contactPhone}`);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">`;

  if (file === 'signboard') {
    return `${open}
  <rect width="${w}" height="${h}" fill="${GREEN}"/>
  <rect x="0" y="${h - 90}" width="${w}" height="90" fill="${GREEN_DARK}"/>
  ${mark(70, 120, 260)}
  <text x="380" y="215" fill="${CREAM}" font-size="44" font-weight="600" letter-spacing="6">HOSTELS · VERIFIED PARTNER</text>
  <text x="380" y="345" fill="#FFFFFF" font-size="${fit(kit.name, w - 450, 130)}" font-weight="700">${name}</text>
  <text x="380" y="420" fill="${CREAM}" font-size="46">${place}</text>
  <text x="70" y="${h - 32}" fill="${CREAM}" font-size="40">${esc(kit.tagline)}</text>
  <text x="${w - 70}" y="${h - 32}" fill="${ORANGE}" font-size="40" font-weight="600" text-anchor="end">${phone}</text>
</svg>`;
  }

  if (file === 'poster') {
    return `${open}
  <rect width="${w}" height="${h}" fill="${CREAM}"/>
  <rect width="${w}" height="620" fill="${GREEN}"/>
  ${mark(w / 2 - 150, 90, 300)}
  <text x="${w / 2}" y="500" fill="${CREAM}" font-size="46" font-weight="600" letter-spacing="6" text-anchor="middle">HOSTELS · VERIFIED PARTNER</text>
  <text x="${w / 2}" y="780" fill="${GREEN_DARK}" font-size="${fit(kit.name, w - 160, 110)}" font-weight="700" text-anchor="middle">${name}</text>
  <text x="${w / 2}" y="860" fill="#4B5550" font-size="44" text-anchor="middle">${place}</text>
  <g font-size="38" fill="#1C2421">
    <text x="160" y="1040">✓  No advance. One monthly bill for bed and food.</text>
    <text x="160" y="1120">✓  Move to any partner hostel, anytime.</text>
    <text x="160" y="1200">✓  Skip a meal before the cut-off, get credit.</text>
    <text x="160" y="1280">✓  Report issues in the app. Replies are tracked.</text>
  </g>
  <rect x="120" y="1400" width="${w - 240}" height="200" rx="28" fill="${GREEN}"/>
  <text x="${w / 2}" y="1478" fill="${CREAM}" font-size="40" text-anchor="middle">Reviews from verified residents only</text>
  <text x="${w / 2}" y="1550" fill="#FFFFFF" font-size="${fit(url, w - 320, 44)}" font-weight="600" text-anchor="middle">${url}</text>
  <text x="${w / 2}" y="1680" fill="#7A837E" font-size="34" text-anchor="middle">${esc(sinceText(kit))} · ${phone}</text>
</svg>`;
  }

  return `${open}
  <circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 4}" fill="${GREEN}"/>
  <circle cx="${w / 2}" cy="${h / 2}" r="${w / 2 - 40}" fill="none" stroke="${CREAM}" stroke-width="6"/>
  ${mark(w / 2 - 130, 130, 260)}
  <text x="${w / 2}" y="470" fill="#FFFFFF" font-size="64" font-weight="700" text-anchor="middle">VERIFIED</text>
  <text x="${w / 2}" y="540" fill="${CREAM}" font-size="40" letter-spacing="6" text-anchor="middle">HOSTELS PARTNER</text>
  <text x="${w / 2}" y="620" fill="${ORANGE}" font-size="${fit(kit.name, 520, 40)}" font-weight="600" text-anchor="middle">${name}</text>
</svg>`;
}
