// app/layout.tsx
import './globals.css'

export const metadata = { title: 'App' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-surface text-ink">
      <body className="h-full">{children}</body>
    </html>
  )
}
