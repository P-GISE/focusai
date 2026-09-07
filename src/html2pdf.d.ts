declare module 'html2pdf.js' {
  type Html2PdfInstance = {
    from(source: HTMLElement): Html2PdfInstance
    set(options: Record<string, unknown>): Html2PdfInstance
    toPdf(): Html2PdfInstance
    outputPdf(type: 'datauristring'): Promise<string>
    save(filename?: string): Promise<void>
  }

  export default function html2pdf(): Html2PdfInstance
}
