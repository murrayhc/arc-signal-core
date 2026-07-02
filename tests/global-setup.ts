import { execSync } from 'node:child_process'
import path from 'node:path'

export default function globalSetup() {
  const url = 'file:' + path.resolve(process.cwd(), 'prisma', 'test.db')
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: {
      ...process.env,
      DATABASE_URL: url,
      // Owner consent recorded 2026-07-02: "Yes, allow test-db resets" —
      // applies ONLY to the disposable prisma/test.db reset below.
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
        'Yes, allow test-db resets (prisma/test.db only) — Murray Hewitt-Coleman, 2026-07-02',
    },
    stdio: 'inherit',
  })
}
