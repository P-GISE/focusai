import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function mergeMissingDefaults(
  target: Record<string, unknown>,
  defaults: Record<string, unknown>,
): boolean {
  let changed = false

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = defaultValue
      changed = true
      continue
    }

    const targetValue = target[key]

    if (isRecord(targetValue) && isRecord(defaultValue)) {
      changed = mergeMissingDefaults(targetValue, defaultValue) || changed
    }
  }

  return changed
}

function readJsonRecord(filePath: string) {
  const value = JSON.parse(readFileSync(filePath, 'utf8')) as unknown

  return isRecord(value) ? value : null
}

function mergeBundledJsonDefaults(sourcePath: string, targetPath: string) {
  let sourceJson: Record<string, unknown> | null
  let targetJson: Record<string, unknown> | null

  try {
    sourceJson = readJsonRecord(sourcePath)
    targetJson = readJsonRecord(targetPath)
  } catch {
    return
  }

  if (!sourceJson || !targetJson) {
    return
  }

  if (mergeMissingDefaults(targetJson, sourceJson)) {
    writeFileSync(targetPath, `${JSON.stringify(targetJson, null, 2)}\n`, 'utf8')
  }
}

export function seedBundledLostarkDiscordBotData(options: {
  bundledBotDir: string
  workingBotDir: string
}) {
  const bundledDataDir = path.join(options.bundledBotDir, 'data')

  if (!existsSync(bundledDataDir) || !statSync(bundledDataDir).isDirectory()) {
    return
  }

  const workingDataDir = path.join(options.workingBotDir, 'data')

  mkdirSync(workingDataDir, { recursive: true })

  for (const entry of readdirSync(bundledDataDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const targetPath = path.join(workingDataDir, entry.name)

    if (existsSync(targetPath)) {
      mergeBundledJsonDefaults(path.join(bundledDataDir, entry.name), targetPath)
      continue
    }

    copyFileSync(path.join(bundledDataDir, entry.name), targetPath)
  }
}
