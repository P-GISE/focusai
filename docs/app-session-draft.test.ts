import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

test('normal session completion clears the local session draft', () => {
  const source = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const start = source.indexOf('completeSessionRef.current =')
  const end = source.indexOf("if (reason === 'goal')", start)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(source.slice(start, end), /clearSessionDraft\(\)/)
})
