import { prisma } from '@/server/db'
import { getActiveProvider } from '@/server/llm/provider'

/** Reports orchestration status WITHOUT ever leaking the API key or any
 *  secret. `configured` reflects whether a live provider is actually
 *  available (key set AND an enabled config exists) — with the seeded
 *  all-disabled configs and no key, this is false/null/[] (dormant). */
export async function GET() {
  const provider = await getActiveProvider()
  const enabledConfigs = await prisma.lLMProviderConfig.findMany({ where: { enabled: true } })

  const enabledTaskTypes = new Set<string>()
  for (const config of enabledConfigs) {
    let taskTypes: string[] = []
    try {
      taskTypes = JSON.parse(config.taskTypesJson) as string[]
    } catch {
      taskTypes = []
    }
    for (const t of taskTypes) enabledTaskTypes.add(t)
  }

  return Response.json({
    configured: provider !== null,
    activeProvider: provider?.name ?? null,
    enabledTaskTypes: Array.from(enabledTaskTypes),
  })
}
