import { existsSync } from 'node:fs'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

const projectRoot = process.cwd()
const envServerPath = path.join(projectRoot, '.env.server')
const envPath = path.join(projectRoot, '.env')

if (existsSync(envServerPath)) {
  loadDotenv({ path: envServerPath, override: false })
}

if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false })
}
