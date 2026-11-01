import sharp from 'sharp';
import { storage } from '../lib/storage';
import { uploadPath } from '../lib/uploads';

/**
 * Demo listing photos: simple room illustrations drawn here and stored like any upload, so demo and test pages load
 * no outside images and the website's Content Security Policy needs no stock-photo host. Fixed keys mean a reseed
 * overwrites the same files.
 */
const PALETTES = [
  { wall: '#E9E2D6', floor: '#B98E62', blanket: '#1F5C46', accent: '#E08A2E' },
  { wall: '#DCE6EA', floor: '#8D6B4F', blanket: '#3A6EA5', accent: '#F2C14E' },
  { wall: '#F1E4E0', floor: '#A47551', blanket: '#B5523B', accent: '#5B8C5A' },
  { wall: '#E3E8DC', floor: '#7E6450', blanket: '#6B4E9B', accent: '#D96C3F' },
  { wall: '#EFE8DA', floor: '#9C7A54', blanket: '#2F7F7A', accent: '#C94F6D' },
  { wall: '#E2E0EA', floor: '#86664A', blanket: '#C77D2B', accent: '#3E7CB1' },
  { wall: '#F3EBDD', floor: '#A9825C', blanket: '#44624A', accent: '#E3A72F' },
  { wall: '#E6EEF0', floor: '#7B5E46', blanket: '#8C3B4A', accent: '#4F9D8D' },
];

function bed(x: number, blanket: string) {
  return `
    <rect x="${x}" y="560" width="250" height="150" rx="10" fill="#5B4636"/>
    <rect x="${x + 10}" y="540" width="230" height="70" rx="12" fill="#FBFAF7"/>
    <rect x="${x + 10}" y="585" width="230" height="95" rx="10" fill="${blanket}"/>
    <rect x="${x + 25}" y="520" width="90" height="42" rx="16" fill="#FFFFFF"/>
    <rect x="${x}" y="470" width="18" height="240" rx="6" fill="#5B4636"/>
    <rect x="${x}" y="705" width="20" height="40" fill="#4A382B"/>
    <rect x="${x + 230}" y="705" width="20" height="40" fill="#4A382B"/>`;
}

function roomSvg(p: (typeof PALETTES)[number], beds: number) {
  const xs = beds === 1 ? [470] : beds === 2 ? [300, 640] : [140, 470, 800];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8CC8EE"/><stop offset="1" stop-color="#E4F2FA"/></linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".35"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".18"/></linearGradient>
  </defs>
  <rect width="1200" height="640" fill="${p.wall}"/>
  <rect y="640" width="1200" height="260" fill="${p.floor}"/>
  <rect y="640" width="1200" height="260" fill="url(#shade)"/>
  <rect y="622" width="1200" height="20" fill="#FFFFFF" opacity=".7"/>
  <rect x="780" y="110" width="300" height="270" rx="8" fill="#FFFFFF"/>
  <rect x="796" y="126" width="268" height="238" fill="url(#sky)"/>
  <rect x="925" y="126" width="10" height="238" fill="#FFFFFF"/>
  <rect x="796" y="240" width="268" height="10" fill="#FFFFFF"/>
  <polygon points="796,364 1064,364 1000,640 640,640" fill="url(#beam)"/>
  <rect x="70" y="150" width="200" height="16" rx="4" fill="#6E5440"/>
  <rect x="88" y="104" width="34" height="46" rx="4" fill="${p.accent}"/>
  <rect x="130" y="116" width="26" height="34" rx="4" fill="${p.blanket}"/>
  <rect x="168" y="96" width="22" height="54" rx="4" fill="#FBFAF7"/>
  <circle cx="230" cy="128" r="22" fill="#5E8C61"/>
  <rect x="1050" y="470" width="80" height="170" rx="8" fill="#6E5440"/>
  <rect x="1062" y="490" width="56" height="10" rx="3" fill="${p.accent}"/>
  ${xs.map((x) => bed(x, p.blanket)).join('')}
</svg>`;
}

export async function seedPhotos(): Promise<string[]> {
  return Promise.all(
    PALETTES.map(async (palette, i) => {
      const key = `pho_seed${String(i + 1).padStart(12, '0')}.jpg`;
      const jpeg = await sharp(Buffer.from(roomSvg(palette, (i % 3) + 1)))
        .jpeg({ quality: 82 })
        .toBuffer();
      await storage.put(key, new Uint8Array(jpeg));
      return uploadPath(key);
    }),
  );
}
