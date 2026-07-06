import type { EventConsequenceSummary } from '@/server/services/consequence'

/** Compact consequence indicators for a dashboard card. Renders nothing when no
 *  summary is available, so cards stay compact and backward-compatible. */
export function ConsequenceIndicators({ s }: { s?: EventConsequenceSummary }) {
  if (!s) return null
  const parts: string[] = [
    `depth ${Math.round(s.evidenceDepthScore * 100)}%`,
    s.originTraced ? 'origin ✓' : 'origin —',
  ]
  if (s.beneficiaries) parts.push(`${s.beneficiaries} benefit`)
  if (s.harmed) parts.push(`${s.harmed} exposed`)
  if (s.contradictions) parts.push(`${s.contradictions} contra`)
  if (s.scenarioPaths) parts.push(`${s.scenarioPaths} scenarios`)
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 text-[9px] uppercase tracking-wider text-ink-faint">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </p>
  )
}
