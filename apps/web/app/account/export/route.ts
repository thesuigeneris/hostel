import { ApiError } from '@hostels/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';

/** "Download my data" (DPDP Act 2023): everything we hold about the signed-in person, as a JSON file. */
export async function GET(req: NextRequest) {
  try {
    const data = await (await api()).me.exportData();
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="hostels-my-data.json"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return NextResponse.redirect(new URL('/login?next=/account', req.url));
    throw e;
  }
}
