import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

test('Android APK packaging is wired through Capacitor', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }

  assert.equal(allDependencies['@capacitor/core'] !== undefined, true)
  assert.equal(allDependencies['@capacitor/android'] !== undefined, true)
  assert.equal(allDependencies['@capacitor/cli'] !== undefined, true)
  assert.equal(packageJson.scripts['build:android:web'], 'node scripts/build-android-client.mjs')
  assert.equal(packageJson.scripts['android:sync'], 'npm run build:android:web && cap sync android')
  assert.equal(packageJson.scripts['android:apk'], 'npm run android:sync && cd android && gradlew assembleDebug')

  const capacitorConfigPath = resolve(repoRoot, 'capacitor.config.ts')
  const androidBuildScriptPath = resolve(repoRoot, 'scripts/build-android-client.mjs')
  const androidProjectPath = resolve(repoRoot, 'android')
  const androidManifestPath = resolve(repoRoot, 'android/app/src/main/AndroidManifest.xml')
  const androidDebugManifestPath = resolve(repoRoot, 'android/app/src/debug/AndroidManifest.xml')
  const androidIconPath = resolve(repoRoot, 'android/app/src/main/res/drawable/focusai_icon.xml')

  assert.equal(existsSync(capacitorConfigPath), true)
  assert.equal(existsSync(androidBuildScriptPath), true)
  assert.equal(existsSync(androidProjectPath), true)
  assert.equal(existsSync(androidManifestPath), true)
  assert.equal(existsSync(androidDebugManifestPath), true)
  assert.equal(existsSync(androidIconPath), true)

  const capacitorConfig = readFileSync(capacitorConfigPath, 'utf8')
  const androidBuildScript = readFileSync(androidBuildScriptPath, 'utf8')
  const androidManifest = readFileSync(androidManifestPath, 'utf8')
  const androidDebugManifest = readFileSync(androidDebugManifestPath, 'utf8')
  const androidIcon = readFileSync(androidIconPath, 'utf8')
  const apiClient = readFileSync(resolve(repoRoot, 'src/lib/api.ts'), 'utf8')
  const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')

  assert.match(capacitorConfig, /appId:\s*'kr\.ibetter\.focusai'/)
  assert.match(capacitorConfig, /appName:\s*'FocusAI'/)
  assert.match(capacitorConfig, /webDir:\s*'dist'/)
  assert.match(capacitorConfig, /usesCleartextAndroidApi/)
  assert.match(capacitorConfig, /allowMixedContent:\s*usesCleartextAndroidApi/)
  assert.match(androidBuildScript, /VITE_ANDROID_API_BASE_URL/)
  assert.match(androidBuildScript, /https:\/\/focusai\.ibetter\.kr\/api/)
  assert.match(androidManifest, /android\.permission\.CAMERA/)
  assert.match(androidManifest, /android\.hardware\.camera/)
  assert.match(androidManifest, /@drawable\/focusai_icon/)
  assert.match(androidManifest, /android:configChanges="[^"]*orientation[^"]*screenSize/)
  assert.doesNotMatch(androidManifest, /android:screenOrientation=/)
  assert.match(androidDebugManifest, /android:usesCleartextTraffic="true"/)
  assert.match(androidIcon, /#0F172A/)
  assert.match(androidIcon, /#22C55E/)
  assert.match(apiClient, /AUTH_TOKEN_STORAGE_KEY/)
  assert.match(apiClient, /shouldUseStoredAuthToken/)
  assert.match(apiClient, /Authorization/)
  assert.match(apiClient, /authToken/)
  assert.match(readme, /Android APK/)
  assert.match(readme, /npm run android:apk/)
})

test('Android report PDF export uses the native Downloads bridge', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const mainActivity = readFileSync(
    resolve(repoRoot, 'android/app/src/main/java/kr/ibetter/focusai/MainActivity.java'),
    'utf8',
  )

  assert.match(appSource, /exportReportPdf\(reportExportRef\.current\)/)
  assert.match(appSource, /savedWithNativeBridge/)
  assert.match(mainActivity, /addJavascriptInterface\(new PdfSaveBridge/)
  assert.match(mainActivity, /@JavascriptInterface/)
  assert.match(mainActivity, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/)
  assert.match(mainActivity, /Environment\.DIRECTORY_DOWNLOADS/)
})
