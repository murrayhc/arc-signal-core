/**
 * Command-centre chrome primitives — server-safe, no state. Square corners and
 * 1px hairlines throughout: the shell reads as a drafting instrument, not a
 * card grid. All colour comes from the @theme tokens in globals.css.
 */

export function Panel({
  id,
  className = '',
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`relative border border-line bg-abyss/60 backdrop-blur-sm ${className}`}
    >
      {/* inner top highlight — the glass edge */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/5" />
      {children}
    </section>
  )
}

/** Panel eyebrow: the instrument label. Display face, uppercase, tracked. */
export function Eyebrow({
  children,
  accent = 'text-ink-dim',
  live = false,
}: {
  children: React.ReactNode
  accent?: string
  live?: boolean
}) {
  return (
    <h2 className={`flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.22em] ${accent}`}>
      {live && <span aria-hidden className="cc-live h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </h2>
  )
}

/** Thin horizontal meter for a 0–1 score. Colour class supplied by caller. */
export function Meter({
  value,
  barClass = 'bg-signal',
  className = '',
}: {
  value: number
  barClass?: string
  className?: string
}) {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <div aria-hidden className={`h-0.5 w-full bg-line/70 ${className}`}>
      <div className={`h-full ${barClass}`} style={{ width: `${Math.round(clamped * 100)}%` }} />
    </div>
  )
}

/** Corner brackets — the instrument-frame marks reserved for the Brain panel. */
export function CornerBrackets() {
  const corner = 'pointer-events-none absolute h-3.5 w-3.5 border-signal/60'
  return (
    <div aria-hidden>
      <span className={`${corner} left-0 top-0 border-l border-t`} />
      <span className={`${corner} right-0 top-0 border-r border-t`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} />
    </div>
  )
}

export function healthDotClass(healthStatus: string): string {
  switch (healthStatus) {
    case 'HEALTHY':
      return 'bg-teal'
    case 'DEGRADED':
      return 'bg-warn'
    case 'FAILING':
      return 'bg-risk'
    case 'UNSUPPORTED':
      return 'bg-ink-faint'
    default:
      return 'bg-line-bright'
  }
}

/** The Archlight aperture mark: an arch over a beam. */
export function Wordmark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M3 20a9 9 0 0 1 18 0" stroke="var(--color-signal)" strokeWidth="1.6" />
      <path d="M7 20a5 5 0 0 1 10 0" stroke="var(--color-gold)" strokeWidth="1.2" opacity="0.7" />
      <path d="M12 3v8" stroke="var(--color-signal)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="1.4" fill="var(--color-ink)" />
    </svg>
  )
}

export const pct = (n: number) => `${Math.round(n * 100)}%`

export const timeUk = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
