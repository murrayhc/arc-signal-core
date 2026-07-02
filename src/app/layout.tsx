import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Archlight — Public Intelligence Radar',
  description:
    'Autonomous public intelligence radar: scans configured public sources and surfaces detected risk and opportunity events.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  )
}
