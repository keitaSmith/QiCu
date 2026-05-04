import type { Metadata } from 'next'
import { MarketingHomePage } from '@/components/marketing/home-page'

export const metadata: Metadata = {
  title: 'QiCu - Practice management for small practitioners',
  description:
    'QiCu helps small healthcare and wellness practitioners manage patients, bookings, services, session notes, tasks, and calendar workflows from one organized dashboard.',
}

export default function HomePage() {
  return <MarketingHomePage />
}
