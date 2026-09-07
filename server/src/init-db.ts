import './load-env.js'
import { env, runtimeFlags } from './env.js'
import { closeMariaPools, ensureDatabase, ensureSchema, getTableNames, pingMaria } from './mariadb.js'

async function main() {
  if (!runtimeFlags.mariaEnabled) {
    throw new Error('MariaDB environment variables are incomplete. Check .env.server.')
  }

  await ensureDatabase()
  await ensureSchema()

  const reachable = await pingMaria()
  const tables = await getTableNames()

  console.log(
    JSON.stringify(
      {
        ok: reachable,
        database: env.MARIADB_DATABASE,
        tables,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
  .finally(async () => {
    await closeMariaPools()
  })
