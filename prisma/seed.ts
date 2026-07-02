import { prisma } from '../src/server/db'
import { runSeed } from '../src/server/seed'

runSeed()
  .then((r) => {
    console.log(`Seeded ${r.sourcesSeeded} sources.`)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
