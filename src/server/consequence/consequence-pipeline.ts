import { resolveCompanyImpacts } from './company-impact'
import { synthesiseContext } from './context'
import { generatePositioningFromImpacts } from './positioning'
import type { ConsequenceCounts, ConsequenceError } from './types'

/** Runs the commercial-consequence layer over a scan's events: for each event,
 *  resolve company impacts → synthesise context + scenarios → generate
 *  impact-based positioning. Deterministic and fault-isolated per event. */
export async function runConsequenceSynthesis(
  events: { id: string }[],
): Promise<{ counts: ConsequenceCounts; errors: ConsequenceError[] }> {
  const errors: ConsequenceError[] = []
  const counts: ConsequenceCounts = { companyImpactsCreated: 0, contextSynthesesCreated: 0, futureScenariosCreated: 0 }

  for (const event of events) {
    try {
      const impacts = await resolveCompanyImpacts(event.id)
      errors.push(...impacts.errors)
      counts.companyImpactsCreated += impacts.impacts.length

      const context = await synthesiseContext(event.id)
      errors.push(...context.errors)
      if (context.synthesis) counts.contextSynthesesCreated += 1
      counts.futureScenariosCreated += context.scenarios.length

      const positioning = await generatePositioningFromImpacts(event.id)
      errors.push(...positioning.errors)
    } catch (err) {
      errors.push({ stage: 'consequence', message: err instanceof Error ? err.message : String(err), eventCandidateId: event.id })
    }
  }

  return { counts, errors }
}
