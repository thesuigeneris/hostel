import { describe, expect, test } from 'bun:test';
import { DEFAULT_MAP_TILES, mapTiles, tileImageSource } from '../src/maps';

describe('map tiles', () => {
  test('free OpenStreetMap tiles unless a valid https tile URL is configured', () => {
    expect(mapTiles()).toEqual(DEFAULT_MAP_TILES);
    expect(mapTiles('')).toEqual(DEFAULT_MAP_TILES);
    // Not https, or missing the {z}/{x}/{y} placeholders: ignored rather than breaking the map.
    expect(mapTiles('http://tiles.example.com/{z}/{x}/{y}.png')).toEqual(DEFAULT_MAP_TILES);
    expect(mapTiles('https://tiles.example.com/map.png')).toEqual(DEFAULT_MAP_TILES);
    const provider = mapTiles('https://tiles.example.com/raster/{z}/{x}/{y}.png?key=abc', '© Example, © OpenStreetMap contributors');
    expect(provider).toEqual({ url: 'https://tiles.example.com/raster/{z}/{x}/{y}.png?key=abc', attribution: '© Example, © OpenStreetMap contributors', maxZoom: 19 });
    // A provider without its own credit line still credits OpenStreetMap.
    expect(mapTiles('https://tiles.example.com/{z}/{x}/{y}.png').attribution).toContain('OpenStreetMap');
  });

  test('the tile host for the Content Security Policy', () => {
    expect(tileImageSource(DEFAULT_MAP_TILES.url)).toBe('https://*.tile.openstreetmap.org');
    expect(tileImageSource('https://tiles.example.com/raster/{z}/{x}/{y}.png?key=abc')).toBe('https://tiles.example.com');
  });
});
