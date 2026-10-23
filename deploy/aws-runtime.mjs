import { readFileSync } from 'node:fs'

const password = readFileSync('/run/secrets/db_app_password', 'utf8').trim()
if (password.length < 32) throw new Error('DB application secret must be at least 32 characters')
if (process.env.AUTO_MIGRATE_SCHEMA !== 'false') throw new Error('Automatic schema migration must stay disabled')
process.env.MARIADB_PASSWORD = password
await import('../server/dist/index.js')
