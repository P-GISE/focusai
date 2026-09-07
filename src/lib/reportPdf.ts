import { Capacitor } from '@capacitor/core'

type AndroidPdfBridge = {
  savePdf: (filename: string, base64Pdf: string) => string
}

type AndroidPdfSaveResult = {
  ok: boolean
  uri?: string
  error?: string
}

type ReportPdfExportResult = {
  savedWithNativeBridge: boolean
}

type Html2PdfFactory = typeof import('html2pdf.js').default

type ReportPdfExportDependencies = {
  androidBridge?: AndroidPdfBridge | null
  documentRef?: Document
  isNativePlatform?: () => boolean
  loadHtml2Pdf?: () => Promise<Html2PdfFactory>
  waitForLayout?: () => Promise<void>
}

function formatLocalDateForFilename(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAndroidPdfSaveResult(rawResult: string): AndroidPdfSaveResult {
  let parsedResult: unknown

  try {
    parsedResult = JSON.parse(rawResult)
  } catch {
    throw new Error('PDF 저장 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }

  if (!isRecord(parsedResult) || typeof parsedResult.ok !== 'boolean') {
    throw new Error('PDF 저장 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }

  if (parsedResult.uri !== undefined && typeof parsedResult.uri !== 'string') {
    throw new Error('PDF 저장 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }

  if (parsedResult.error !== undefined && typeof parsedResult.error !== 'string') {
    throw new Error('PDF 저장 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }

  return {
    ok: parsedResult.ok,
    uri: parsedResult.uri,
    error: parsedResult.error,
  }
}

async function loadDefaultHtml2Pdf() {
  return (await import('html2pdf.js')).default
}

function getDefaultAndroidBridge() {
  return (window as Window & { FocusAiAndroid?: AndroidPdfBridge }).FocusAiAndroid
}

function waitForBrowserLayout() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

export async function exportReportPdf(
  reportElement: HTMLElement,
  now = new Date(),
  dependencies: ReportPdfExportDependencies = {},
): Promise<ReportPdfExportResult> {
  const documentRef = dependencies.documentRef ?? document
  const exportNode = reportElement.cloneNode(true) as HTMLElement
  exportNode.classList.add('pdf-export-node')
  const exportHost = documentRef.createElement('div')
  exportHost.className = 'pdf-export-host'
  exportHost.appendChild(exportNode)
  documentRef.body.appendChild(exportHost)

  try {
    await (dependencies.waitForLayout ?? waitForBrowserLayout)()
    const html2pdf = await (dependencies.loadHtml2Pdf ?? loadDefaultHtml2Pdf)()
    const filename = `focusai-report-${formatLocalDateForFilename(now)}.pdf`
    const pdfOptions = {
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: {
        scale: 1.25,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
    }
    const pdfWorker = html2pdf().from(exportNode).set(pdfOptions)

    if ((dependencies.isNativePlatform ?? Capacitor.isNativePlatform)()) {
      const dataUri = await pdfWorker.toPdf().outputPdf('datauristring')
      const base64Pdf = dataUri.split(',')[1]
      const androidBridge =
        'androidBridge' in dependencies ? dependencies.androidBridge : getDefaultAndroidBridge()

      if (!base64Pdf) {
        throw new Error('PDF 데이터 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }

      if (!androidBridge) {
        throw new Error('Android PDF 저장 기능을 사용할 수 없습니다.')
      }

      const saveResult = parseAndroidPdfSaveResult(androidBridge.savePdf(filename, base64Pdf))
      if (!saveResult.ok) {
        throw new Error(saveResult.error || 'PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }

      return { savedWithNativeBridge: true }
    }

    await pdfWorker.save()
    return { savedWithNativeBridge: false }
  } finally {
    exportHost.remove()
  }
}
