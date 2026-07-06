import { prisma } from '@/server/db'

/** Flip `enabled` on every LLMProviderConfig. Returns the number updated.
 *  Activation also requires ANTHROPIC_API_KEY in the environment (see
 *  docs/ai-activation.md) — this only toggles the DB-side gate. */
export async function setConfigsEnabled(enabled: boolean): Promise<number> {
  const res = await prisma.lLMProviderConfig.updateMany({ data: { enabled } })
  return res.count
}

// Run from the CLI: `npx tsx scripts/llm-activate.ts on|off`
if (process.argv[1] && process.argv[1].endsWith('llm-activate.ts')) {
  const arg = (process.argv[2] ?? 'on').toLowerCase()
  const enabled = arg !== 'off'
  setConfigsEnabled(enabled)
    .then(async (n) => {
      console.log(`${enabled ? 'Enabled' : 'Disabled'} ${n} LLM provider config(s).`)
      await prisma.$disconnect()
    })
    .catch(async (e) => {
      console.error(e)
      await prisma.$disconnect()
      process.exit(1)
    })
}
