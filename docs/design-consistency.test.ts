import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
const appNavigationSource = readFileSync(resolve(repoRoot, 'src/components/AppNavigation.tsx'), 'utf8')
const appCss = readFileSync(resolve(repoRoot, 'src/App.css'), 'utf8')
const indexCss = readFileSync(resolve(repoRoot, 'src/index.css'), 'utf8')
const navigationSource = readFileSync(resolve(repoRoot, 'src/lib/navigation.ts'), 'utf8')
const designContract = readFileSync(resolve(repoRoot, 'DESIGN.md'), 'utf8')
const gitAttributes = readFileSync(resolve(repoRoot, '.gitattributes'), 'utf8')
const gitIgnore = readFileSync(resolve(repoRoot, '.gitignore'), 'utf8')
const designBaseline = JSON.parse(readFileSync(resolve(repoRoot, 'docs/design-baseline.json'), 'utf8')) as {
  tone: string
  viewports: Array<{ name: string; width: number; height: number; surface: string; referenceImage: string }>
  requirements: Record<string, unknown>
}
const css = `${indexCss}\n${appCss}`
const uiSource = `${appSource}\n${appNavigationSource}`

function cssSection(start: string, end: string) {
  const startIndex = appCss.indexOf(start)

  if (startIndex === -1) {
    return ''
  }

  if (!end) {
    return appCss.slice(startIndex)
  }

  const endIndex = appCss.indexOf(end, startIndex + start.length)
  return appCss.slice(startIndex, endIndex === -1 ? undefined : endIndex)
}

test('Korean UI typography keeps natural letter spacing', () => {
  assert.doesNotMatch(indexCss, /fonts\.googleapis\.com/)
  assert.doesNotMatch(indexCss, /@import\s+url\('https:\/\//)
  assert.doesNotMatch(css, /letter-spacing:\s*-/)
  assert.match(indexCss, /letter-spacing:\s*0;/)
  assert.match(
    appCss,
    /:where\(h1,\s*h2,\s*h3,\s*p,\s*button,\s*input,\s*textarea,\s*select,\s*label,\s*legend,\s*span,\s*strong,\s*small\)/,
  )
  assert.match(appCss, /word-break:\s*keep-all;/)
})

test('design tokens define the restrained FocusAI interface scale', () => {
  assert.match(indexCss, /--focus-radius-card:\s*12px;/)
  assert.match(indexCss, /--focus-radius-control:\s*8px;/)
  assert.match(indexCss, /--focus-surface-card:\s*#ffffff;/)
  assert.match(indexCss, /--focus-border-subtle:\s*rgba\(148,\s*163,\s*184,\s*0\.22\);/)
  assert.match(indexCss, /--focus-shadow-card:\s*0 12px 28px rgba\(15,\s*23,\s*42,\s*0\.07\);/)
  assert.match(indexCss, /--focus-ring:\s*3px solid rgba\(37,\s*99,\s*235,\s*0\.28\);/)
  assert.match(indexCss, /--focus-ring-offset:\s*3px;/)
  assert.match(indexCss, /--focus-status-gap:\s*0\.55rem;/)
  assert.match(indexCss, /--focus-runtime-local-bg:\s*#ecfeff;/)
  assert.match(indexCss, /--focus-runtime-online-bg:\s*#dcfce7;/)
  assert.match(indexCss, /--focus-runtime-offline-bg:\s*#fef3c7;/)
})

test('design baseline defines the visual QA contract', () => {
  assert.equal(designBaseline.tone, 'quiet operational learning dashboard')
  assert.deepEqual(
    designBaseline.viewports.map((viewport) => `${viewport.name}:${viewport.width}x${viewport.height}`),
    ['desktop-login:1440x900', 'mobile-login:500x844'],
  )
  assert.deepEqual(
    designBaseline.viewports.map((viewport) => viewport.referenceImage),
    [
      'docs/visual-baselines/focusai-login-desktop-1440x900.png',
      'docs/visual-baselines/focusai-login-mobile-500x844.png',
    ],
  )
  for (const viewport of designBaseline.viewports) {
    assert.equal(existsSync(resolve(repoRoot, viewport.referenceImage)), true)
  }
  assert.equal(designBaseline.requirements.noHorizontalOverflow, true)
  assert.equal(designBaseline.requirements.cjkWordBreak, 'keep-all')
  assert.equal(designBaseline.requirements.focusRingToken, '--focus-ring')
  assert.equal(designBaseline.requirements.formFieldsNamed, true)
  assert.match(designContract, /Raw color literals are allowed only/)
  assert.match(designContract, /Update these images only after a deliberate design change/)
})

test('git attributes keep text line endings stable across Windows edits', () => {
  assert.match(gitAttributes, /^\* text=auto eol=lf$/m)
  assert.match(gitAttributes, /^\*\.ps1 text eol=crlf$/m)
  assert.match(gitAttributes, /^\*\.png binary$/m)
  assert.match(gitIgnore, /^playwright-report\/$/m)
  assert.match(gitIgnore, /^test-results\/$/m)
  assert.match(gitIgnore, /^\.playwright-cli\/$/m)
})

test('navigation metadata is outside the monolithic App component', () => {
  assert.match(appSource, /from '\.\/lib\/navigation'/)
  assert.match(navigationSource, /export type Screen =/)
  assert.match(navigationSource, /export const NAV_ITEMS/)
  assert.match(navigationSource, /id: 'dashboard'/)
  assert.doesNotMatch(appSource, /const NAV_ITEMS:/)
})

test('core surfaces and controls use shared design tokens', () => {
  assert.match(appCss, /border-radius:\s*var\(--focus-radius-card\);/)
  assert.match(appCss, /border-radius:\s*var\(--focus-radius-control\);/)
  assert.match(appCss, /background:\s*var\(--focus-surface-card\);/)
  assert.match(appCss, /box-shadow:\s*var\(--focus-shadow-card\);/)
})

test('mobile auth layout wraps copy instead of clipping horizontally', () => {
  assert.match(appCss, /\.auth-shell\s*{\s*overflow-x:\s*hidden;/)
  assert.match(appCss, /\.auth-hero\s*{\s*min-width:\s*0;/)
  assert.match(appCss, /\.auth-hero p\s*{\s*overflow-wrap:\s*anywhere;/)
})

test('settings profile display name field uses a stable label and input grid', () => {
  assert.match(appSource, /className="settings-row settings-profile-name-row"/)
  assert.match(
    appCss,
    /\.settings-profile-name-row\s*{[^}]*grid-template-columns:\s*minmax\(7rem,\s*0\.32fr\)\s*minmax\(0,\s*1fr\);/s,
  )
  assert.match(appCss, /\.settings-profile-name-row input\s*{[^}]*min-width:\s*0;/s)
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.settings-profile-name-row\s*{[\s\S]*grid-template-columns:\s*1fr;/,
  )
})

test('design alignment audit keeps compact labels and mobile visual groups stable', () => {
  assert.match(appSource, /className="settings-row settings-subject-add-row"/)
  assert.match(
    appCss,
    /\.settings-subject-add-row\s*{[^}]*grid-template-columns:\s*minmax\(7rem,\s*0\.24fr\)\s*minmax\(0,\s*1fr\);/s,
  )
  assert.match(appCss, /\.insight-summary span\s*{[^}]*white-space:\s*nowrap;/s)
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.weekly-bars\s*{[\s\S]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\);/,
  )
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.camera-overlay-copy\s*{[\s\S]*top:\s*1rem;[\s\S]*bottom:\s*auto;/,
  )
})

test('settings page does not render the removed quick navigation panel', () => {
  assert.doesNotMatch(appSource, /settings-quick-card/)
  assert.doesNotMatch(appSource, /settings-quick-groups/)
  assert.doesNotMatch(appSource, />빠른 이동</)
  assert.doesNotMatch(appCss, /\.settings-quick-card/)
  assert.doesNotMatch(appCss, /\.settings-quick-groups/)
})

test('settings page keeps the desktop section selector as an aligned card grid', () => {
  const navListRule = appCss.match(/\.settings-nav-list\s*{[^}]*}/)?.[0] ?? ''
  const navButtonRule = appCss.match(/\.settings-nav-button\s*{[^}]*}/)?.[0] ?? ''
  const navCardRule = appCss.match(/\.settings-nav-card\s*{[^}]*}/)?.[0] ?? ''

  assert.match(appSource, /className="settings-card settings-nav-card"/)
  assert.match(appSource, /settingsSections\.map\(\(section\) =>/)
  assert.match(appSource, /className=\{`settings-nav-button\$\{activeSettingsSection === section\.id \? ' active' : ''\}`\}/)
  assert.match(appSource, /onClick=\{\(\) => setActiveSettingsSection\(section\.id\)\}/)
  assert.match(appCss, /\.settings-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s)
  assert.match(navCardRule, /padding:\s*0\.55rem;/)
  assert.match(navCardRule, /position:\s*static;/)
  assert.match(navCardRule, /box-shadow:\s*none;/)
  assert.match(navListRule, /display:\s*grid;/)
  assert.match(navListRule, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(9rem,\s*1fr\)\);/)
  assert.doesNotMatch(navListRule, /overflow-x:\s*auto;/)
  assert.doesNotMatch(navListRule, /scroll-snap-type:/)
  assert.match(appCss, /\.settings-section-stack\s*{[^}]*display:\s*grid;/s)
  assert.match(navButtonRule, /width:\s*100%;/)
  assert.match(navButtonRule, /min-width:\s*0;/)
  assert.match(navButtonRule, /display:\s*grid;/)
  assert.match(navButtonRule, /align-content:\s*start;/)
  assert.match(navButtonRule, /text-align:\s*left;/)
  assert.doesNotMatch(navButtonRule, /flex:/)
  assert.match(appCss, /\.settings-nav-copy\s*{[^}]*display:\s*block;/s)
  assert.match(appCss, /\.settings-nav-button\.active\s*{[^}]*background:/s)
})

test('runtime environment status labels local settings only and omits server settings from the UI', () => {
  const serverSettingsLabel = ['서버', '세팅'].join('')

  assert.match(appSource, /function getRuntimeMode\(\)/)
  assert.match(appSource, /로컬세팅/)
  assert.doesNotMatch(uiSource, new RegExp(serverSettingsLabel))
  assert.match(appNavigationSource, /className="runtime-status-strip"/)
  assert.match(appNavigationSource, /className="auth-runtime-panel"/)
  assert.match(appCss, /\.runtime-status-strip\s*{[^}]*display:\s*flex;/s)
  assert.match(appCss, /\.runtime-pill\.local\s*{[^}]*background:/s)
  assert.doesNotMatch(appCss, /\.runtime-pill\.server\s*{/)
  assert.match(appCss, /\.auth-runtime-panel\s*{[^}]*display:\s*grid;/s)
  assert.match(appNavigationSource, /className="runtime-status-line"/)
  assert.match(appNavigationSource, /className="runtime-status-line api-status"/)
  assert.match(appCss, /\.runtime-status-line\s*{[^}]*display:\s*inline-flex;/s)
  assert.match(appCss, /\.runtime-status-line\.api-status\s*{[^}]*justify-self:\s*end;/s)
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.runtime-status-strip\s*{[\s\S]*display:\s*none;/,
  )
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.runtime-status-line\s*{[\s\S]*justify-content:\s*space-between;/,
  )
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.runtime-status-line\.api-status\s*{[\s\S]*justify-content:\s*flex-end;/,
  )
})

test('interactive controls expose keyboard focus and form field names', () => {
  const formFields = [...appSource.matchAll(/<(input|textarea|select)\b(?<attrs>[\s\S]*?)\/?>/g)]
  const missingNameOrId = formFields.filter((match) => {
    const attrs = match.groups?.attrs ?? ''
    return !/\bname=/.test(attrs) && !/\bid=/.test(attrs)
  })

  assert.equal(missingNameOrId.length, 0)
  assert.match(indexCss, /:where\(button,\s*input,\s*textarea,\s*select,\s*a\[href\]\):focus-visible/)
  assert.match(indexCss, /outline:\s*var\(--focus-ring\);/)
  assert.match(indexCss, /outline-offset:\s*var\(--focus-ring-offset\);/)
  assert.match(appCss, /\.runtime-status-line\s*{[\s\S]*gap:\s*var\(--focus-status-gap\);/)
  assert.match(appCss, /\.runtime-pill\.local\s*{[\s\S]*background:\s*var\(--focus-runtime-local-bg\);/)
  assert.match(appCss, /\.runtime-pill\.online\s*{[\s\S]*background:\s*var\(--focus-runtime-online-bg\);/)
  assert.match(appCss, /\.runtime-pill\.offline\s*{[\s\S]*background:\s*var\(--focus-runtime-offline-bg\);/)
  assert.match(appCss, /\.auth-form input:focus-visible,/)
  assert.match(appCss, /\.admin-filter-field input:focus-visible,/)
  assert.match(
    appCss,
    /@media \(max-width: 760px\)[\s\S]*\.auth-hero p\s*{[\s\S]*word-break:\s*keep-all;[\s\S]*overflow-wrap:\s*normal;/,
  )
  assert.doesNotMatch(appCss, /\.auth-form input:focus,/)
  assert.doesNotMatch(appCss, /\.admin-filter-field input:focus,/)
})

test('report disturbance donut avoids zero-data conic gradients for PDF export', () => {
  const donutStart = appSource.indexOf('function DisturbanceDonut')
  const donutEnd = appSource.indexOf('const DEFAULT_SETUP', donutStart)
  const donutSource = appSource.slice(donutStart, donutEnd)

  assert.match(donutSource, /const safeItems = items\.map/)
  assert.match(donutSource, /Number\.isFinite\(item\.value\) && item\.value > 0/)
  assert.match(donutSource, /const total = safeItems\.reduce\(\(sum, item\) => sum \+ item\.value, 0\)/)
  assert.match(donutSource, /const hasDisturbanceData = total > 0/)
  assert.match(donutSource, /const donutBackground = hasDisturbanceData/)
  assert.match(donutSource, /: '#e2e8f0'/)
  assert.match(donutSource, /background: donutBackground/)
  assert.doesNotMatch(donutSource, /#e2e8f0 0% 100%/)
  assert.doesNotMatch(donutSource, /style=\{\{ background: `conic-gradient/)
  assert.doesNotMatch(donutSource, /const total = items\.reduce\(\(sum, item\) => sum \+ item\.value, 0\) \|\| 1/)
})

test('report subject bars keep nonzero dimensions for PDF export', () => {
  const barTrackCss = cssSection('.bar-track {', '.focus-ring-wrap')
  const barRowCss = cssSection('.bar-row {', '.bar-row > span')
  const barRowLabelCss = cssSection('.bar-row > span {', '.bar-track')

  assert.match(appSource, /width:\s*`\$\{Math\.max\(entry\.score, 8\)\}%`/)
  assert.match(
    barRowCss,
    /grid-template-columns:\s*minmax\(6\.5rem,\s*7\.5rem\)\s*minmax\(6rem,\s*1fr\)\s*minmax\(2\.5rem,\s*auto\);/,
  )
  assert.doesNotMatch(barRowLabelCss, /flex:/)
  assert.doesNotMatch(barTrackCss.match(/\.bar-track\s*{[^}]*}/)?.[0] ?? '', /flex:/)
  assert.match(barTrackCss, /min-width:\s*6rem;/)
  assert.match(barTrackCss, /height:\s*0\.65rem;/)
  assert.match(barTrackCss, /overflow:\s*hidden;/)
})

test('settings section selector becomes compact horizontal quick navigation on mobile', () => {
  const mobileCss = cssSection(
    '@media (max-width: 1100px)',
    '@media (orientation: portrait)',
  )

  assert.match(
    mobileCss,
    /\.settings-nav-card\s*{[\s\S]*position:\s*sticky;[\s\S]*padding:\s*0;[\s\S]*box-shadow:\s*none;/,
  )
  assert.match(
    mobileCss,
    /\.settings-nav-list\s*{[\s\S]*display:\s*flex;[\s\S]*overflow-x:\s*auto;[\s\S]*scroll-snap-type:\s*x proximity;/,
  )
  assert.match(
    mobileCss,
    /\.settings-nav-button\s*{[\s\S]*flex:\s*0 0 clamp\(8\.5rem,\s*42vw,\s*11rem\);[\s\S]*scroll-snap-align:\s*start;/,
  )
  assert.match(mobileCss, /\.settings-nav-copy\s*{[\s\S]*display:\s*none;/)
})

test('settings mobile section selector does not expand the rotated page width', () => {
  const mobileCss = cssSection(
    '@media (max-width: 1100px)',
    '@media (orientation: portrait)',
  )

  assert.match(appCss, /\.settings-nav-card,\s*\.settings-detail-card\s*{[^}]*min-width:\s*0;/s)
  assert.match(appCss, /\.settings-nav-list\s*{[^}]*min-width:\s*0;/s)
  assert.match(mobileCss, /\.settings-nav-card\s*{[\s\S]*overflow:\s*hidden;/)
  assert.match(mobileCss, /\.settings-nav-list\s*{[\s\S]*max-width:\s*100%;/)
})

test('settings section selector stays compact on native tablet landscape rotation only', () => {
  const tabletLandscapeCss = cssSection(
    '@media (orientation: landscape) and (min-width: 1101px) and (max-width: 1400px) and (max-height: 760px)',
    '@media (orientation: portrait)',
  )

  assert.match(appSource, /Capacitor\.isNativePlatform\(\)/)
  assert.match(appSource, /native-runtime/)
  assert.doesNotMatch(
    appCss,
    /@media \(max-width: 1100px\),\s*\(orientation: landscape\) and \(min-width: 1101px\) and \(max-width: 1400px\) and \(max-height: 760px\)/,
  )
  assert.match(
    tabletLandscapeCss,
    /\.native-runtime\s+\.settings-nav-card\s*{[\s\S]*position:\s*sticky;[\s\S]*overflow:\s*hidden;/,
  )
  assert.match(
    tabletLandscapeCss,
    /\.native-runtime\s+\.settings-nav-list\s*{[\s\S]*display:\s*flex;[\s\S]*overflow-x:\s*auto;/,
  )
})

test('authenticated top bar does not render quick navigation links', () => {
  assert.doesNotMatch(appSource, /top-nav-links/)
  assert.doesNotMatch(appSource, /className=\{`nav-link/)
  assert.doesNotMatch(appCss, /\.top-nav-links/)
  assert.doesNotMatch(appCss, /\.nav-link/)
})

test('mobile portrait uses a sidebar toggle while landscape keeps the regular sidebar', () => {
  const landscapeSidebarCss = cssSection(
    '@media (orientation: landscape) and (max-width: 1100px)',
    '@media (orientation: portrait)',
  )

  assert.match(appSource, /mobileSidebarOpen/)
  assert.match(appNavigationSource, /className="sidebar-toggle"/)
  assert.match(appNavigationSource, /aria-controls="main-sidebar"/)
  assert.match(appNavigationSource, /id="main-sidebar"/)
  assert.match(appNavigationSource, /mobileSidebarOpen \? ' is-open' : ''/)
  assert.match(appSource, /setMobileSidebarOpen\(false\)/)

  assert.match(appCss, /\.sidebar-toggle\s*{[^}]*display:\s*none;/s)
  assert.match(appCss, /\.sidebar-backdrop\s*{[^}]*display:\s*none;/s)
  assert.match(
    appCss,
    /@media \(orientation: portrait\) and \(max-width: 1100px\)[\s\S]*\.sidebar-toggle\s*{[\s\S]*display:\s*inline-flex;/,
  )
  assert.match(
    appCss,
    /@media \(orientation: portrait\) and \(max-width: 1100px\)[\s\S]*\.sidebar\s*{[\s\S]*position:\s*fixed;[\s\S]*transform:\s*translateX\(-105%\);/,
  )
  assert.match(
    appCss,
    /@media \(orientation: portrait\) and \(max-width: 1100px\)[\s\S]*\.sidebar\.is-open\s*{[\s\S]*transform:\s*translateX\(0\);/,
  )
  assert.match(
    appCss,
    /@media \(orientation: portrait\) and \(max-width: 1100px\)[\s\S]*\.sidebar-backdrop\.is-open\s*{[\s\S]*pointer-events:\s*auto;/,
  )
  assert.match(
    landscapeSidebarCss,
    /\.app-body\s*{[\s\S]*grid-template-columns:\s*228px minmax\(0,\s*1fr\);/,
  )
  assert.match(
    landscapeSidebarCss,
    /\.sidebar\s*{[\s\S]*order:\s*0;[\s\S]*position:\s*sticky;[\s\S]*padding-block:\s*clamp\(1rem,\s*3vh,\s*2\.5rem\);/,
  )
  assert.match(
    landscapeSidebarCss,
    /\.sidebar-item:first-child\s*{[\s\S]*margin-top:\s*auto;/,
  )
  assert.match(landscapeSidebarCss, /\.sidebar-item:last-child\s*{[\s\S]*margin-bottom:\s*auto;/)
  assert.doesNotMatch(landscapeSidebarCss, /position:\s*fixed;/)
})
