import * as pdfjsLib from 'pdfjs-dist'

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

export type CachedPage = {
  imageDataUrl: string | null
  text: string | null
  ocrText: string | null
  analysisResult: string | null
}

export type PdfMetadata = {
  title: string
  author: string
  pageCount: number
}

type LoadedDocument = {
  doc: pdfjsLib.PDFDocumentProxy
  metadata: PdfMetadata
}

export class PdfExtractor {
  private documents = new Map<string, LoadedDocument>()
  private pageCache = new Map<string, Map<number, CachedPage>>()
  private static OCR_THRESHOLD = 50

  async loadDocument(
    paperId: string,
    data: ArrayBuffer,
  ): Promise<PdfMetadata> {
    if (this.documents.has(paperId)) {
      return this.documents.get(paperId)!.metadata
    }

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
      disableAutoFetch: true,
    }).promise

    const pdfMetadata = await doc.getMetadata().catch(() => null)
    const info = pdfMetadata?.info as Record<string, string> | undefined

    const metadata: PdfMetadata = {
      title: info?.Title || '',
      author: info?.Author || '',
      pageCount: doc.numPages,
    }

    this.documents.set(paperId, { doc, metadata })
    this.pageCache.set(paperId, new Map())

    return metadata
  }

  async getPageText(paperId: string, pageNum: number): Promise<string> {
    const cached = this.getCachedPage(paperId, pageNum)
    if (cached?.text !== null && cached?.text !== undefined) {
      return cached.text
    }

    const pdfText = await this.extractPdfJsText(paperId, pageNum)

    if (pdfText.length >= PdfExtractor.OCR_THRESHOLD) {
      this.setCacheField(paperId, pageNum, 'text', pdfText)
      return pdfText
    }

    // Scanned page — try OCR if available
    try {
      const imageData = await this.getPageImage(paperId, pageNum)
      const ocrText = await this.runOcr(imageData)
      this.setCacheField(paperId, pageNum, 'text', ocrText)
      this.setCacheField(paperId, pageNum, 'ocrText', ocrText)
      return ocrText
    } catch {
      // OCR not available, return whatever pdf.js gave us
      this.setCacheField(paperId, pageNum, 'text', pdfText)
      return pdfText
    }
  }

  async getPageImage(
    paperId: string,
    pageNum: number,
    dpi = 150,
  ): Promise<string> {
    const cached = this.getCachedPage(paperId, pageNum)
    if (cached?.imageDataUrl) {
      return cached.imageDataUrl
    }

    const loaded = this.documents.get(paperId)
    if (!loaded) throw new Error(`Document ${paperId} not loaded`)

    const page = await loaded.doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: dpi / 72 })

    const canvas = new OffscreenCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    )
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create canvas context')

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const buffer = await blob.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        '',
      ),
    )
    const dataUrl = `data:image/png;base64,${base64}`

    this.setCacheField(paperId, pageNum, 'imageDataUrl', dataUrl)
    return dataUrl
  }

  async getFullText(paperId: string): Promise<string> {
    const loaded = this.documents.get(paperId)
    if (!loaded) throw new Error(`Document ${paperId} not loaded`)

    const texts: string[] = []
    for (let i = 1; i <= loaded.metadata.pageCount; i++) {
      texts.push(await this.getPageText(paperId, i))
    }
    return texts.join('\n\n')
  }

  async searchText(
    paperId: string,
    query: string,
  ): Promise<{ page: number; context: string }[]> {
    const loaded = this.documents.get(paperId)
    if (!loaded) throw new Error(`Document ${paperId} not loaded`)

    const results: { page: number; context: string }[] = []
    const lowerQuery = query.toLowerCase()

    for (let i = 1; i <= loaded.metadata.pageCount; i++) {
      const text = await this.getPageText(paperId, i)
      const lowerText = text.toLowerCase()
      let startIdx = 0

      while (true) {
        const idx = lowerText.indexOf(lowerQuery, startIdx)
        if (idx === -1) break

        const contextStart = Math.max(0, idx - 100)
        const contextEnd = Math.min(text.length, idx + query.length + 100)
        results.push({
          page: i,
          context: text.slice(contextStart, contextEnd),
        })
        startIdx = idx + 1
      }
    }

    return results
  }

  getMetadata(paperId: string): PdfMetadata | null {
    return this.documents.get(paperId)?.metadata ?? null
  }

  isDocumentLoaded(paperId: string): boolean {
    return this.documents.has(paperId)
  }

  unloadDocument(paperId: string): void {
    const loaded = this.documents.get(paperId)
    if (loaded) {
      loaded.doc.destroy()
      this.documents.delete(paperId)
      this.pageCache.delete(paperId)
    }
  }

  getCachedAnalysis(paperId: string, pageNum: number): string | null {
    return this.getCachedPage(paperId, pageNum)?.analysisResult ?? null
  }

  setCachedAnalysis(
    paperId: string,
    pageNum: number,
    result: string,
  ): void {
    this.setCacheField(paperId, pageNum, 'analysisResult', result)
  }

  private async extractPdfJsText(
    paperId: string,
    pageNum: number,
  ): Promise<string> {
    const loaded = this.documents.get(paperId)
    if (!loaded) throw new Error(`Document ${paperId} not loaded`)

    const page = await loaded.doc.getPage(pageNum)
    const textContent = await page.getTextContent()
    return textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
  }

  private async runOcr(imageDataUrl: string): Promise<string> {
    // Dynamically import tesseract.js only when needed
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const { data } = await worker.recognize(imageDataUrl)
      return data.text
    } finally {
      await worker.terminate()
    }
  }

  private getCachedPage(
    paperId: string,
    pageNum: number,
  ): CachedPage | undefined {
    return this.pageCache.get(paperId)?.get(pageNum)
  }

  private setCacheField(
    paperId: string,
    pageNum: number,
    field: keyof CachedPage,
    value: string,
  ): void {
    let docCache = this.pageCache.get(paperId)
    if (!docCache) {
      docCache = new Map()
      this.pageCache.set(paperId, docCache)
    }
    let page = docCache.get(pageNum)
    if (!page) {
      page = {
        imageDataUrl: null,
        text: null,
        ocrText: null,
        analysisResult: null,
      }
      docCache.set(pageNum, page)
    }
    page[field] = value
  }
}
