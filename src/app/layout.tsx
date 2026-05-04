// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s - QiCu',
    default: 'QiCu - Practice management for small practitioners',
  },
  description:
    'QiCu helps small healthcare and wellness practitioners manage patients, bookings, services, session notes, tasks, and calendar workflows from one organized dashboard.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-white">
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/css?f%5B%5D=switzer@400,500,600,700&display=swap"
        />
      </head>
      <body className="h-full text-gray-950 antialiased">{children}</body>
    </html>
  )
}
