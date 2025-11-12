import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const { rows } = await db.query('SELECT 1 as ok');
    return NextResponse.json({ connected: true, result: rows[0] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: err?.message ?? 'Unknown DB error' }, { status: 500 });
  }
}
