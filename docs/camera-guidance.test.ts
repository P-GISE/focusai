import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  CAMERA_ACCESS_RECOVERY_STEPS,
  VISION_MODEL_FALLBACK_MESSAGE,
  describeCameraAccessError,
} from '../src/lib/cameraGuidance.js'

const require = createRequire(import.meta.url)
const repoRoot = resolve(import.meta.dirname, '..')
const tasksVisionRoot = dirname(require.resolve('@mediapipe/tasks-vision'))
const tasksVisionWasmDir = join(tasksVisionRoot, 'wasm')

test('camera access errors are translated into actionable Korean guidance', () => {
  assert.match(describeCameraAccessError({ name: 'NotAllowedError' }), /사이트 설정에서 카메라를 허용/)
  assert.match(describeCameraAccessError({ name: 'NotFoundError' }), /사용 가능한 카메라를 찾지 못했습니다/)
  assert.match(describeCameraAccessError({ name: 'NotReadableError' }), /다른 앱이 사용 중/)
  assert.match(describeCameraAccessError({ name: 'OverconstrainedError' }), /선택한 카메라 설정/)
  assert.ok(CAMERA_ACCESS_RECOVERY_STEPS.some((step) => step.includes('주소창')))
})

test('camera screen wires fallback guidance and MediaPipe retry controls', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const studyVisionSource = readFileSync(resolve(repoRoot, 'src/lib/studyVision.ts'), 'utf8')

  assert.match(appSource, /describeCameraAccessError/)
  assert.match(appSource, /VISION_MODEL_FALLBACK_MESSAGE/)
  assert.match(appSource, /CAMERA_ACCESS_RECOVERY_STEPS/)
  assert.match(appSource, /resetStudyVision/)
  assert.match(appSource, /camera-recovery-alert/)
  assert.match(studyVisionSource, /export function resetStudyVision/)
  assert.match(VISION_MODEL_FALLBACK_MESSAGE, /브라우저 기본 신호/)
})

test('study vision assets are served from the app origin for CSP-safe Android WebView loading', async () => {
  const studyVisionSource = readFileSync(resolve(repoRoot, 'src/lib/studyVision.ts'), 'utf8')
  const syncScript = readFileSync(resolve(repoRoot, 'scripts/sync-mediapipe-assets.mjs'), 'utf8')
  const buildClientScript = readFileSync(resolve(repoRoot, 'scripts/build-client.mjs'), 'utf8')
  const buildAndroidScript = readFileSync(resolve(repoRoot, 'scripts/build-android-client.mjs'), 'utf8')
  const devClientScript = readFileSync(resolve(repoRoot, 'scripts/dev-client.mjs'), 'utf8')
  const { syncMediapipeAssets } = await import('../scripts/sync-mediapipe-assets.mjs')
  const tempRoot = mkdtempSync(join(tmpdir(), 'focusai-mediapipe-assets-'))

  assert.match(studyVisionSource, /const WASM_ROOT = '\/mediapipe\/tasks-vision\/wasm'/)
  assert.doesNotMatch(studyVisionSource, /cdn\.jsdelivr\.net/)
  assert.match(syncScript, /@mediapipe\/tasks-vision/)
  assert.match(syncScript, /vision_wasm_internal\.js/)
  assert.match(syncScript, /vision_wasm_internal\.wasm/)
  assert.match(buildClientScript, /sync-mediapipe-assets\.mjs/)
  assert.match(buildAndroidScript, /sync-mediapipe-assets\.mjs/)
  assert.match(devClientScript, /sync-mediapipe-assets\.mjs/)

  await syncMediapipeAssets(tempRoot)
  assert.equal(
    existsSync(join(tempRoot, 'public/mediapipe/tasks-vision/wasm/vision_wasm_internal.js')),
    true,
  )
  assert.equal(
    existsSync(join(tempRoot, 'public/mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm')),
    true,
  )
})

test('study vision asset sync skips unchanged files instead of overwriting generated assets', async () => {
  const { syncMediapipeAssets } = await import('../scripts/sync-mediapipe-assets.mjs')
  const tempRoot = mkdtempSync(join(tmpdir(), 'focusai-mediapipe-idempotent-'))
  const assetName = 'vision_wasm_internal.wasm'
  const targetDir = join(tempRoot, 'public/mediapipe/tasks-vision/wasm')
  const targetPath = join(targetDir, assetName)

  mkdirSync(targetDir, { recursive: true })
  copyFileSync(join(tasksVisionWasmDir, assetName), targetPath)
  chmodSync(targetPath, 0o444)

  try {
    await syncMediapipeAssets(tempRoot)
  } finally {
    chmodSync(targetPath, 0o666)
  }

  assert.equal(existsSync(targetPath), true)
})

test('client build keeps the Vite root project-relative for Windows paths', () => {
  const buildClientScript = readFileSync(resolve(repoRoot, 'scripts/build-client.mjs'), 'utf8')

  assert.doesNotMatch(buildClientScript, /root:\s*process\.cwd\(\)/)
  assert.match(buildClientScript, /root:\s*'\.'/)
})

test('TypeScript build metadata is written outside node_modules', () => {
  const appTsConfig = readFileSync(resolve(repoRoot, 'tsconfig.app.json'), 'utf8')
  const nodeTsConfig = readFileSync(resolve(repoRoot, 'tsconfig.node.json'), 'utf8')
  const gitignore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8')

  assert.doesNotMatch(appTsConfig, /"tsBuildInfoFile":\s*"[^"]*node_modules\//)
  assert.doesNotMatch(nodeTsConfig, /"tsBuildInfoFile":\s*"[^"]*node_modules\//)
  assert.match(appTsConfig, /"tsBuildInfoFile":\s*"\.\/tsconfig\.app\.tsbuildinfo"/)
  assert.match(nodeTsConfig, /"tsBuildInfoFile":\s*"\.\/tsconfig\.node\.tsbuildinfo"/)
  assert.match(gitignore, /^\*\.tsbuildinfo$/m)
})
