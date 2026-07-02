import path from 'node:path'

process.env.DATABASE_URL = 'file:' + path.resolve(process.cwd(), 'prisma', 'test.db')
