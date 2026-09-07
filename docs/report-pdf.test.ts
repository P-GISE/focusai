import test from 'node:test'
import assert from 'node:assert/strict'
import { exportReportPdf, parseAndroidPdfSaveResult } from '../src/lib/reportPdf'

class FakeClassList {
  private readonly values = new Set<string>()

  add(value: string) {
    this.values.add(value)
  }

  contains(value: string) {
    return this.values.has(value)
  }
}

class FakeElement {
  readonly children: unknown[] = []
  readonly classList = new FakeClassList()
  className = ''
  removed = false

  cloneNode() {
    return new FakeElement()
  }

  appendChild(child: unknown) {
    this.children.push(child)
    return child
  }

  remove() {
    this.removed = true
  }
}

type FakePdfWorker = {
  from: (source: HTMLElement) => FakePdfWorker
  set: (options: Record<string, unknown>) => FakePdfWorker
  toPdf: () => FakePdfWorker
  outputPdf: (type: 'datauristring') => Promise<string>
  save: () => Promise<void>
}

function requireCreatedHost(createdHost: FakeElement | null) {
  assert.notEqual(createdHost, null)
  return createdHost
}

function createFakeDocument() {
  const body = new FakeElement()
  let createdHost: FakeElement | null = null
  const documentRef = {
    body,
    createElement() {
      createdHost = new FakeElement()
      return createdHost
    },
  } as unknown as Document

  return {
    body,
    documentRef,
    getCreatedHost: () => requireCreatedHost(createdHost),
  }
}

function createFakePdfFactory(actions: string[], dataUri = 'data:application/pdf;base64,Zm9jdXNhaQ==') {
  const worker: FakePdfWorker = {
    from() {
      actions.push('from')
      return worker
    },
    set(options) {
      actions.push(`set:${String(options.filename)}`)
      return worker
    },
    toPdf() {
      actions.push('toPdf')
      return worker
    },
    async outputPdf(type) {
      actions.push(`outputPdf:${type}`)
      return dataUri
    },
    async save() {
      actions.push('save')
    },
  }

  return () => worker
}

test('exportReportPdf saves web PDFs and removes the hidden export host', async () => {
  const actions: string[] = []
  const fakeDocument = createFakeDocument()
  const reportElement = new FakeElement() as unknown as HTMLElement

  const result = await exportReportPdf(reportElement, new Date('2026-07-29T12:00:00+09:00'), {
    documentRef: fakeDocument.documentRef,
    isNativePlatform: () => false,
    loadHtml2Pdf: async () => createFakePdfFactory(actions),
    waitForLayout: async () => {
      actions.push('wait')
    },
  })

  const exportHost = fakeDocument.getCreatedHost()
  const exportNode = exportHost.children[0] as FakeElement
  assert.deepEqual(actions, ['wait', 'from', 'set:focusai-report-2026-07-29.pdf', 'save'])
  assert.equal(result.savedWithNativeBridge, false)
  assert.equal(fakeDocument.body.children[0], exportHost)
  assert.equal(exportHost.className, 'pdf-export-host')
  assert.equal(exportNode.classList.contains('pdf-export-node'), true)
  assert.equal(exportHost.removed, true)
})

test('exportReportPdf saves native Android PDFs through the bridge', async () => {
  const actions: string[] = []
  const fakeDocument = createFakeDocument()
  const reportElement = new FakeElement() as unknown as HTMLElement
  const bridgeCalls: Array<{ filename: string; base64Pdf: string }> = []

  const result = await exportReportPdf(reportElement, new Date('2026-07-29T12:00:00+09:00'), {
    androidBridge: {
      savePdf(filename, base64Pdf) {
        bridgeCalls.push({ filename, base64Pdf })
        return JSON.stringify({ ok: true, uri: 'content://downloads/focusai.pdf' })
      },
    },
    documentRef: fakeDocument.documentRef,
    isNativePlatform: () => true,
    loadHtml2Pdf: async () => createFakePdfFactory(actions),
    waitForLayout: async () => {
      actions.push('wait')
    },
  })

  assert.deepEqual(actions, ['wait', 'from', 'set:focusai-report-2026-07-29.pdf', 'toPdf', 'outputPdf:datauristring'])
  assert.deepEqual(bridgeCalls, [{ filename: 'focusai-report-2026-07-29.pdf', base64Pdf: 'Zm9jdXNhaQ==' }])
  assert.equal(result.savedWithNativeBridge, true)
  assert.equal(fakeDocument.getCreatedHost().removed, true)
})

test('exportReportPdf rejects invalid native bridge responses and still cleans up', async () => {
  const actions: string[] = []
  const fakeDocument = createFakeDocument()
  const reportElement = new FakeElement() as unknown as HTMLElement

  await assert.rejects(
    exportReportPdf(reportElement, new Date('2026-07-29T12:00:00+09:00'), {
      androidBridge: {
        savePdf() {
          return '{invalid-json'
        },
      },
      documentRef: fakeDocument.documentRef,
      isNativePlatform: () => true,
      loadHtml2Pdf: async () => createFakePdfFactory(actions),
      waitForLayout: async () => undefined,
    }),
    /PDF 저장 응답을 확인할 수 없습니다/,
  )

  assert.equal(fakeDocument.getCreatedHost().removed, true)
})

test('parseAndroidPdfSaveResult validates bridge response shapes', () => {
  assert.deepEqual(parseAndroidPdfSaveResult(JSON.stringify({ ok: false, error: '저장 실패' })), {
    ok: false,
    uri: undefined,
    error: '저장 실패',
  })

  assert.throws(() => parseAndroidPdfSaveResult(JSON.stringify({ ok: true, error: 10 })), /PDF 저장 응답/)
  assert.throws(() => parseAndroidPdfSaveResult(JSON.stringify({ uri: 'content://downloads/report.pdf' })), /PDF 저장 응답/)
})
