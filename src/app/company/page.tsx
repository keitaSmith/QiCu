import type { Metadata } from 'next'
import { MarketingCompanyPage } from '@/components/marketing/company-page'

export const metadata: Metadata = {
  title: 'About QiCu',
  description:
    'Learn why QiCu exists and how it is being shaped for small-practice patient, booking, note, and calendar workflows.',
}

export default function CompanyPage() {
  return <MarketingCompanyPage />
}
