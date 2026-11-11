import { SEARCH_TEXT_MAX, SUGGEST_MIN_CHARS, type Suggestions } from '@hostels/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { visitorApi } from '@/lib/api';

/**
 * Suggestions for the search box. The browser can't call the API itself (the API is server-side only, and the CSP
 * allows same-origin fetches), so this passes the typed text through with a short cache. When the API is down the
 * list is simply empty: the search form still works without it.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, SEARCH_TEXT_MAX);
  const empty: Suggestions = { q, items: [] };
  if (q.length < SUGGEST_MIN_CHARS) return NextResponse.json(empty);
  try {
    const result = await (await visitorApi(60)).hostels.suggest(q);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return NextResponse.json(empty, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
