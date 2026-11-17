/**
 * Map tiles, shared by the website (Leaflet) and the app (Leaflet in a WebView). Free and keyless by default:
 * OpenStreetMap's own tile servers, which are fine for development and a small launch but ask heavy users to move to a
 * tile provider (https://operations.osmfoundation.org/policies/tiles/). Moving is a setting, not a code change: give a
 * provider's raster tile URL and its credit line (web: NEXT_PUBLIC_MAP_TILE_URL / NEXT_PUBLIC_MAP_ATTRIBUTION; app:
 * EXPO_PUBLIC_MAP_TILE_URL / EXPO_PUBLIC_MAP_ATTRIBUTION). See docs/RUN.md, "Maps".
 */
export type MapTiles = { url: string; attribution: string; maxZoom: number };

export const DEFAULT_MAP_TILES: MapTiles = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  // OpenStreetMap's licence asks for a link to its copyright page.
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

/** Leaflet 1.9.4 for the app's WebView map, pinned with the hashes of the published files (same as the website's). */
export const LEAFLET_CDN = {
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  jsIntegrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  cssIntegrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
} as const;

/** The tiles to use: a configured https tile URL (with {z}, {x}, {y}) and its credit line, else the free default. */
export function mapTiles(url?: string | null, attribution?: string | null): MapTiles {
  const u = url?.trim();
  if (!u || !/^https:\/\/[^/\s]+\/\S*\{z\}\S*\{x\}\S*\{y\}/.test(u)) return DEFAULT_MAP_TILES;
  return { url: u, attribution: attribution?.trim() || DEFAULT_MAP_TILES.attribution, maxZoom: 19 };
}

/**
 * Where the tile images come from, for a Content Security Policy `img-src`: the URL's host, with a `{s}` subdomain
 * placeholder widened to `*` ("https://*.tile.openstreetmap.org").
 */
export function tileImageSource(url: string): string {
  const host = /^https:\/\/([^/]+)\//.exec(url)?.[1] ?? 'tile.openstreetmap.org';
  return `https://${host.replace(/\{s\}/g, '*')}`;
}
