import type { Metadata } from 'next'
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

// Command-centre faces, exposed as CSS variables only. Nothing outside the
// dashboard components references them (via the font-display/font-body/
// font-data theme tokens), so every other route keeps its existing font stack.
const chakra = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-chakra',
})
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: 'Archlight — Public Intelligence Radar',
  description:
    'Autonomous public intelligence radar: scans configured public sources and surfaces detected risk and opportunity events.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${chakra.variable} ${plexSans.variable} ${plexMono.variable} min-h-screen bg-slate-950 text-slate-100 antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
