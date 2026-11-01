import sharp from 'sharp';

/** Larger than any phone camera (200 MP sensors bin to 50 MP); refuses decompression bombs before they use memory. */
const MAX_PIXELS = 60_000_000;

/**
 * Re-encodes an uploaded photo without its metadata: EXIF (including GPS position, camera serial and time taken),
 * XMP, IPTC, ICC profiles and PNG/WebP text chunks. The EXIF orientation is applied to the pixels first, so phone
 * photos keep the right way up once the tag is gone. Re-encoding also drops anything appended after the image data.
 * Returns null when the bytes aren't a decodable image.
 */
export async function stripMetadata(bytes: Uint8Array, ext: 'jpg' | 'png' | 'webp'): Promise<Uint8Array | null> {
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
    const out = ext === 'jpg' ? image.jpeg({ quality: 85 }) : ext === 'png' ? image.png() : image.webp({ quality: 85 });
    return new Uint8Array(await out.toBuffer());
  } catch {
    return null;
  }
}
