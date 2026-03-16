// src/app/api/bookings/route.ts
import { NextResponse } from 'next/server'
import { BOOKINGS } from '@/data/bookings'

// GET /api/bookings → return all bookings (in-memory)
export async function GET() {
  return NextResponse.json(BOOKINGS, { status: 200 })
}
