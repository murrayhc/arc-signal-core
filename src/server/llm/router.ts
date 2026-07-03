import { prisma } from '@/server/db'
import type { LLMTaskType } from '@/shared/enums'

/** Minimal shape routeTask needs — a subset of LLMProviderConfig so pure
 *  routing logic can be unit-tested without touching the DB. */
export type RouterConfig = {
  modelName: string
  taskTypesJson: string
  enabled: boolean
  costTier: string
  latencyTier: string
}

export type RoutedModel = {
  modelName: string
  costTier: string
  latencyTier: string
}

/** Pure: picks the config whose taskTypesJson includes the requested task.
 *  Prefers enabled configs; ties are broken deterministically by modelName
 *  (ascending). Returns null when no config supports the task. */
export function routeTask(taskType: LLMTaskType, configs: RouterConfig[]): RoutedModel | null {
  const candidates = configs.filter((c) => {
    let taskTypes: string[] = []
    try {
      taskTypes = JSON.parse(c.taskTypesJson) as string[]
    } catch {
      taskTypes = []
    }
    return taskTypes.includes(taskType)
  })
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.modelName.localeCompare(b.modelName)
  })

  const picked = sorted[0]
  return { modelName: picked.modelName, costTier: picked.costTier, latencyTier: picked.latencyTier }
}

/** Reads all provider configs from the DB for use with routeTask. */
export async function loadRouterConfigs(): Promise<RouterConfig[]> {
  const rows = await prisma.lLMProviderConfig.findMany()
  return rows.map((r) => ({
    modelName: r.modelName,
    taskTypesJson: r.taskTypesJson,
    enabled: r.enabled,
    costTier: r.costTier,
    latencyTier: r.latencyTier,
  }))
}
