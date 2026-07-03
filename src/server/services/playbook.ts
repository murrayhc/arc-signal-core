import { prisma } from '@/server/db'
import { exportJson, type PlaybookJson } from '@/server/playbook/service'

/** Serialized playbook shape for API/UI consumption — *Json columns are
 *  always expanded into arrays here, never leaked raw. */
export type PlaybookData = PlaybookJson

/** Reads the persisted playbook for an OpportunityCard, serialized for API/UI
 *  use. Returns null if none has been generated yet (callers that want
 *  generate-if-absent should call generatePlaybook first). */
export async function getPlaybookData(cardId: string): Promise<PlaybookData | null> {
  const playbook = await prisma.opportunityPlaybook.findUnique({ where: { opportunityCardId: cardId } })
  if (!playbook) return null
  return exportJson(playbook)
}

export type LLMAuditProviderConfig = {
  id: string
  providerName: string
  modelName: string
  taskTypes: string[]
  enabled: boolean
  costTier: string
  latencyTier: string
}

export type LLMAuditRun = {
  id: string
  taskType: string
  provider: string
  model: string
  status: string
  tokenCountInput: number
  tokenCountOutput: number
  estimatedCost: number
  latencyMs: number
  createdAt: string
  validation: {
    validationStatus: string
    schemaValid: boolean
    evidenceGrounded: boolean
    prohibitedLanguageDetected: boolean
    unsupportedClaimsDetected: boolean
  } | null
}

export type LLMAudit = {
  configs: LLMAuditProviderConfig[]
  runs: LLMAuditRun[]
}

function parseTaskTypes(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Read-only audit data for the /admin/llm page: provider configs (never the
 *  API key — LLMProviderConfig has no key column, only routing metadata) and
 *  recent LLMRun rows with their validation outcome. */
export async function getLLMAudit(limit = 30): Promise<LLMAudit> {
  const [configRows, runRows] = await Promise.all([
    prisma.lLMProviderConfig.findMany({ orderBy: { modelName: 'asc' } }),
    prisma.lLMRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { validations: true },
    }),
  ])

  const configs: LLMAuditProviderConfig[] = configRows.map((c) => ({
    id: c.id,
    providerName: c.providerName,
    modelName: c.modelName,
    taskTypes: parseTaskTypes(c.taskTypesJson),
    enabled: c.enabled,
    costTier: c.costTier,
    latencyTier: c.latencyTier,
  }))

  const runs: LLMAuditRun[] = runRows.map((r) => {
    const validation = r.validations[0]
    return {
      id: r.id,
      taskType: r.taskType,
      provider: r.provider,
      model: r.model,
      status: r.status,
      tokenCountInput: r.tokenCountInput,
      tokenCountOutput: r.tokenCountOutput,
      estimatedCost: r.estimatedCost,
      latencyMs: r.latencyMs,
      createdAt: r.createdAt.toISOString(),
      validation: validation
        ? {
            validationStatus: validation.validationStatus,
            schemaValid: validation.schemaValid,
            evidenceGrounded: validation.evidenceGrounded,
            prohibitedLanguageDetected: validation.prohibitedLanguageDetected,
            unsupportedClaimsDetected: validation.unsupportedClaimsDetected,
          }
        : null,
    }
  })

  return { configs, runs }
}
