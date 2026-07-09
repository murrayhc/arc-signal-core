import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import {
  canonicalEntityKey,
  isNameableOrganisation,
  resolveEntityName,
} from '@/server/evidence/entities'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

// ── Classifier: the audit's failure modes can never be named companies ──────

describe('entity resolver classification', () => {
  it.each([
    ['Chief Executive', 'ROLE_OR_TITLE'],
    ['Chief Executive Officer', 'ROLE_OR_TITLE'],
    ['Managing Director', 'ROLE_OR_TITLE'],
    ['The Government', 'ROLE_OR_TITLE'],
    ['Manchester', 'PLACE'],
    ['United Kingdom', 'PLACE'],
    ['North Sea', 'PLACE'],
    ['Next Tuesday'.split(' ')[1], 'TIME_OR_GENERIC'], // 'Tuesday'
    ['January', 'TIME_OR_GENERIC'],
    ['Mr Jones', 'PERSON'],
    ['Sir Keir Starmer', 'PERSON'],
    ['Dr Sarah Chen', 'PERSON'],
  ])('"%s" → %s, never nameable', (name, kind) => {
    expect(resolveEntityName(name).kind).toBe(kind)
    expect(isNameableOrganisation(name)).toBe(false)
  })

  it.each([
    ['Voltcore Ltd', 'legal-form suffix'],
    ['Meridian Grid Systems Limited', 'legal-form suffix'],
    ['Acme Corp', 'legal-form suffix'],
    ['Bank of England', 'organisational keyword'],
    ['Manchester Airport', 'organisational keyword'], // keyword beats the place token inside
    ['Example Borough Council', 'organisational keyword'],
    ['Voltcore Technologies', 'organisational keyword'],
  ])('"%s" → ORGANISATION (%s)', (name, basis) => {
    const resolved = resolveEntityName(name)
    expect(resolved.kind).toBe('ORGANISATION')
    expect(resolved.basis).toBe(basis)
    expect(isNameableOrganisation(name)).toBe(true)
  })

  it('brand-shaped mentions are nameable; sentence fragments are not', () => {
    expect(isNameableOrganisation('Voltcore')).toBe(true)
    expect(isNameableOrganisation('Meridian Grid Systems')).toBe(true)
    // Lowercase continuation / fragment shapes fail the brand regex.
    expect(isNameableOrganisation('The company said on')).toBe(false)
    expect(isNameableOrganisation('It')).toBe(false)
  })

  it('folds legal suffixes and aliases into one canonical key', () => {
    expect(canonicalEntityKey('Voltcore Ltd')).toBe('voltcore')
    expect(canonicalEntityKey('Voltcore Limited')).toBe('voltcore')
    expect(canonicalEntityKey('VOLTCORE LTD')).toBe('voltcore')
    expect(canonicalEntityKey('Voltcore')).toBe('voltcore')
    expect(canonicalEntityKey('Rolls Royce')).toBe('rolls-royce')
    expect(canonicalEntityKey('Acme Corp')).toBe(canonicalEntityKey('Acme Corporation'))
  })
})

// ── Messy-prose regression corpus through the full impact resolver ──────────

describe('company impacts on messy real-world prose', () => {
  beforeEach(resetDb)

  it('names only real organisations; roles, places and people never appear', async () => {
    const body =
      'Chief Executive Sarah Chen told staff on Tuesday that Voltcore Ltd will cut 400 jobs in Manchester. ' +
      'The Government urged calm while Bank of England analysts watch the sector. ' +
      'Voltcore Limited is shedding hundreds of roles across its sites, Mr Jones, a union spokesman, confirmed.'
    const { event } = await makeEventGraph(body, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)

    const named = await prisma.companyImpact.findMany({
      where: { eventCandidateId: event.id, entityId: { not: null } },
    })
    const names = named.map((i) => i.companyName)

    // Real organisations present.
    expect(names.some((n) => n.toLowerCase().startsWith('voltcore'))).toBe(true)
    // The audit's failure modes are absent.
    for (const banned of ['Chief Executive', 'Manchester', 'Tuesday', 'The Government', 'Mr Jones', 'Sarah Chen']) {
      expect(names).not.toContain(banned)
    }

    // Suffix variants merged: Voltcore Ltd + Voltcore Limited = ONE impact,
    // one entity, with the variants recorded.
    const voltcoreImpacts = named.filter((i) => i.companyName.toLowerCase().startsWith('voltcore'))
    expect(voltcoreImpacts).toHaveLength(1)
    const meta = JSON.parse(voltcoreImpacts[0].metadataJson) as { mentionVariants?: string[]; nameBasis?: string }
    expect(meta.mentionVariants?.length).toBeGreaterThanOrEqual(2)
    expect(meta.nameBasis).toBe('legal-form suffix')
    expect(voltcoreImpacts[0].impactPathway).toContain('identified as an organisation')

    const entities = await prisma.entity.findMany({ where: { canonicalKey: 'voltcore' } })
    expect(entities).toHaveLength(1)
  })

  it('populates the entity join tables (previously dead scaffolding)', async () => {
    const body = 'Voltcore Ltd will cut 400 jobs at its Manchester plant as demand weakens.'
    const { event } = await makeEventGraph(body, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)

    const eventLinks = await prisma.eventCandidateEntity.findMany({ where: { eventCandidateId: event.id } })
    expect(eventLinks.length).toBeGreaterThanOrEqual(1)

    const clusterLinks = await prisma.signalClusterEntity.findMany()
    expect(clusterLinks.length).toBeGreaterThanOrEqual(1)

    // Idempotent re-run: no duplicate links.
    await resolveCompanyImpacts(event.id)
    expect(await prisma.eventCandidateEntity.count({ where: { eventCandidateId: event.id } })).toBe(eventLinks.length)
  })
})
