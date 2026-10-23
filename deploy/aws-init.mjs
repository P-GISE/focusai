import { readFileSync } from 'node:fs'
import { createConnection } from 'mariadb'

if (process.env.FOCUSAI_INITIALIZE_EMPTY_DATABASE !== 'yes') {
  throw new Error('Explicit fresh database initialization is required')
}
const rootPassword = readFileSync('/run/secrets/db_root_password', 'utf8').trim()
const appPassword = readFileSync('/run/secrets/db_app_password', 'utf8').trim()
if (rootPassword.length < 32 || appPassword.length < 32 || rootPassword === appPassword) {
  throw new Error('Independent DB secrets of at least 32 characters are required')
}
let connection
let closeMariaPools
try {
  connection = await createConnection({
    host: process.env.MARIADB_HOST,
    port: Number(process.env.MARIADB_PORT ?? 3306),
    user: 'root', password: rootPassword,
  })
  const existing = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'focusai'",
  )
  if (Number(existing[0].count) !== 0) throw new Error('Database is not empty; initialization refused')
  process.env.MARIADB_USER = 'root'
  process.env.MARIADB_PASSWORD = rootPassword
  const schema = await import('../server/dist/mariadb.js')
  closeMariaPools = schema.closeMariaPools
  await schema.ensureSchema()
  await connection.query("CREATE USER 'focusai_app'@'%' IDENTIFIED BY ?", [appPassword])
  await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON focusai.* TO 'focusai_app'@'%'")
  const tables = await schema.getTableNames()
  if (tables.length !== 14) throw new Error('Unexpected schema table count')
  console.log(JSON.stringify({ initialized: true, tableCount: tables.length, runtimePrivileges: 'CRUD' }))
} catch (error) {
  // Driver errors can include connection details or SQL parameter values.
  console.error(JSON.stringify({ initialized: false, code: error?.code ?? 'INITIALIZATION_REFUSED' }))
  process.exitCode = 1
} finally {
  await closeMariaPools?.()
  await connection?.end()
}
