import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/errors';

export async function GET() {
  try {
    const { rows } = await db.query('SELECT 1 as ok');
    return NextResponse.json({ connected: true, result: rows[0] }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ connected: false, error: getErrorMessage(err, 'Unknown DB error') }, { status: 500 });
  }
}
