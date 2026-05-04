import type { Metadata } from 'next'
import { MarketingPricingPage } from '@/components/marketing/pricing-page'

export const metadata: Metadata = {
  title: 'QiCu Pricing',
  description:
    'QiCu pricing directions for solo practitioners, growing practices, and custom workflows.',
}

export default function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  return <MarketingPricingPage searchParams={searchParams} />
}
