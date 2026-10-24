import { ApiError } from '@hostels/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { BRAND_FILES, type BrandFile, brandSvg } from '@/lib/brand-kit';

/** Serves a brand kit file as SVG. `?download=1` saves it instead of showing it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file: raw } = await params;
  const file = raw.replace(/\.svg$/, '') as BrandFile;
  if (!(file in BRAND_FILES)) return new NextResponse('Not found', { status: 404 });
  try {
    const kit = await (await api()).owner.brandKit(id);
    const headers: Record<string, string> = { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" };
    if (req.nextUrl.searchParams.get('download')) {
      headers['Content-Disposition'] = `attachment; filename="${kit.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hostel'}-${file}.svg"`;
    }
    return new NextResponse(brandSvg(kit, file), { headers });
  } catch (e) {
    if (e instanceof ApiError) return new NextResponse(e.message, { status: e.status === 401 ? 401 : e.status === 402 || e.status === 403 ? 403 : 404 });
    throw e;
  }
}
