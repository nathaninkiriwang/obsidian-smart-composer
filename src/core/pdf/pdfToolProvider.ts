import { Vault } from 'obsidian'

import { ContentPart, RequestTool } from '../../types/llm/request'
import { MentionablePdf } from '../../types/mentionable'

import { PdfAnalyzer } from './pdfAnalyzer'
import { PdfExtractor } from './pdfExtractor'

export type PdfToolResult = {
  content: string | ContentPart[]
}

const PDF_TOOLS: RequestTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_pdf_overview',
      description:
        'Get an overview of a PDF paper including metadata, page count, and detected section headings. Call this first to understand the paper structure before diving into specific pages.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: {
            type: 'string',
            description: 'The paper identifier',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pdf_page_text',
      description:
        'Get the extracted text content from specific pages of a PDF. Uses OCR automatically for scanned documents. Best for reading text-heavy content. Max 5 pages per call.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          start_page: {
            type: 'number',
            description: '1-indexed start page',
          },
          end_page: {
            type: 'number',
            description:
              '1-indexed end page (inclusive). Max 5 pages per call.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pdf_page_image',
      description:
        'Get a rendered image of a specific PDF page. Use this when you need to see the visual layout, figures, or equations directly. Returns the page as an image.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          page: {
            type: 'number',
            description: '1-indexed page number',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_pdf_page',
      description:
        'Perform deep analysis of a PDF page using a vision model. Returns structured extraction including figure descriptions, LaTeX equations, table data, and formatted text. More thorough than get_pdf_page_text but costs an additional model call. Use for pages with important figures, equations, or complex layouts.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          page: { type: 'number' },
          focus: {
            type: 'string',
            description:
              "Optional: specific aspect to focus on (e.g., 'equations', 'figures', 'tables')",
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_pdf',
      description:
        'Search for specific text within a PDF document. Returns matching page numbers and surrounding context. Useful for finding where specific topics, equations, or terms appear.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          query: {
            type: 'string',
            description: 'Text to search for',
          },
        },
      },
    },
  },
]

export class PdfToolProvider {
  private paperIdMap = new Map<string, MentionablePdf>()

  constructor(
    private extractor: PdfExtractor,
    private analyzer: PdfAnalyzer,
    private vault: Vault,
  ) {}

  /**
   * Load mentioned PDFs and return tool definitions + system message.
   */
  async preparePdfTools(mentionedPapers: MentionablePdf[]): Promise<{
    tools: RequestTool[]
    systemMessage: string
  }> {
    if (mentionedPapers.length === 0) {
      return { tools: [], systemMessage: '' }
    }

    const paperDescriptions: string[] = []

    for (const paper of mentionedPapers) {
      const paperId = paper.zoteroKey
      this.paperIdMap.set(paperId, paper)

      if (!this.extractor.isDocumentLoaded(paperId)) {
        const data = await this.vault.readBinary(paper.file)
        await this.extractor.loadDocument(paperId, data)
      }

      const metadata = this.extractor.getMetadata(paperId)
      if (metadata) {
        paperDescriptions.push(
          `- ${paperId}: "${paper.title}" — ${metadata.pageCount} pages`,
        )
      }
    }

    const systemMessage = `You have access to the following PDF papers. Use the PDF tools to read their content.
Do NOT guess or assume content — always use the tools to verify.

Papers:
${paperDescriptions.join('\n')}

Available tools: get_pdf_overview, get_pdf_page_text, get_pdf_page_image, analyze_pdf_page, search_pdf`

    return { tools: PDF_TOOLS, systemMessage }
  }

  /**
   * Handle a tool call from the LLM. Returns text or multi-modal content.
   */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<PdfToolResult> {
    const paperId = args.paper_id as string

    switch (toolName) {
      case 'get_pdf_overview':
        return this.handleOverview(paperId)
      case 'get_pdf_page_text':
        return this.handlePageText(
          paperId,
          args.start_page as number,
          args.end_page as number,
        )
      case 'get_pdf_page_image':
        return this.handlePageImage(paperId, args.page as number)
      case 'analyze_pdf_page':
        return this.handleAnalyzePage(
          paperId,
          args.page as number,
          args.focus as string | undefined,
        )
      case 'search_pdf':
        return this.handleSearch(paperId, args.query as string)
      default:
        return { content: `Unknown PDF tool: ${toolName}` }
    }
  }

  isPdfTool(toolName: string): boolean {
    return PDF_TOOLS.some((t) => t.function.name === toolName)
  }

  private async handleOverview(paperId: string): Promise<PdfToolResult> {
    const metadata = this.extractor.getMetadata(paperId)
    if (!metadata) return { content: `Paper ${paperId} not loaded.` }

    const paper = this.paperIdMap.get(paperId)

    // Extract text from first 3 pages to find headings
    const headings: string[] = []
    const maxScanPages = Math.min(metadata.pageCount, 10)
    for (let i = 1; i <= maxScanPages; i++) {
      const text = await this.extractor.getPageText(paperId, i)
      // Simple heading detection: lines that look like section headers
      const lines = text.split('\n').filter((l) => l.trim().length > 0)
      for (const line of lines) {
        const trimmed = line.trim()
        if (
          /^\d+\.?\s+[A-Z]/.test(trimmed) ||
          /^(Abstract|Introduction|Conclusion|References|Methods|Results|Discussion|Appendix|Related Work|Background|Experiments?|Evaluation)/i.test(
            trimmed,
          )
        ) {
          headings.push(`  Page ${i}: ${trimmed.slice(0, 100)}`)
        }
      }
    }

    // Get abstract from first page
    const firstPageText = await this.extractor.getPageText(paperId, 1)
    const abstractMatch = firstPageText.match(
      /abstract[:\s]*([\s\S]{50,1000}?)(?=\n\s*\n|\d+\.\s|Introduction)/i,
    )

    let result = `# Paper Overview: ${paper?.title || metadata.title || paperId}\n\n`
    result += `**Pages:** ${metadata.pageCount}\n`
    if (metadata.author) result += `**Author(s):** ${metadata.author}\n`
    if (abstractMatch) result += `\n**Abstract:**\n${abstractMatch[1].trim()}\n`
    if (headings.length > 0) {
      result += `\n**Detected Sections:**\n${headings.join('\n')}\n`
    }

    return { content: result }
  }

  private async handlePageText(
    paperId: string,
    startPage: number,
    endPage: number,
  ): Promise<PdfToolResult> {
    const metadata = this.extractor.getMetadata(paperId)
    if (!metadata) return { content: `Paper ${paperId} not loaded.` }

    const start = Math.max(1, startPage)
    const end = Math.min(metadata.pageCount, endPage, start + 4) // max 5 pages

    const pages: string[] = []
    for (let i = start; i <= end; i++) {
      const text = await this.extractor.getPageText(paperId, i)
      pages.push(`--- Page ${i} ---\n${text}`)
    }

    return { content: pages.join('\n\n') }
  }

  private async handlePageImage(
    paperId: string,
    page: number,
  ): Promise<PdfToolResult> {
    const imageDataUrl = await this.extractor.getPageImage(paperId, page)
    return {
      content: [
        {
          type: 'text',
          text: `Page ${page} of paper ${paperId}:`,
        },
        {
          type: 'image_url',
          image_url: { url: imageDataUrl },
        },
      ],
    }
  }

  private async handleAnalyzePage(
    paperId: string,
    page: number,
    focus?: string,
  ): Promise<PdfToolResult> {
    const result = await this.analyzer.analyzePage(paperId, page, focus)
    return { content: result }
  }

  private async handleSearch(
    paperId: string,
    query: string,
  ): Promise<PdfToolResult> {
    const results = await this.extractor.searchText(paperId, query)
    if (results.length === 0) {
      return { content: `No matches found for "${query}" in paper ${paperId}.` }
    }

    const formatted = results
      .slice(0, 10) // max 10 results
      .map((r) => `**Page ${r.page}:** ...${r.context}...`)
      .join('\n\n')

    return {
      content: `Found ${results.length} match(es) for "${query}":\n\n${formatted}`,
    }
  }
}
