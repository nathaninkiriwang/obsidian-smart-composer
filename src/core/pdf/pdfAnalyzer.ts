import { BaseLLMProvider } from '../llm/base'
import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'

import { PdfExtractor } from './pdfExtractor'

const ANALYSIS_SYSTEM_PROMPT = `You are a specialized PDF page analyzer. Given a rendered page image from an academic paper, provide a thorough structured extraction:

1. **Text**: Extract all visible text, preserving formatting and logical reading order.
2. **Figures & Plots**: Describe every figure, chart, and plot in detail — axes labels, trends, key data points, visual patterns.
3. **Equations**: Extract all mathematical equations in LaTeX notation (e.g., \\( E = mc^2 \\)).
4. **Tables**: Parse tables into markdown format with headers and alignment.
5. **Algorithms**: Describe any pseudocode or algorithm blocks.
6. **Key Observations**: Note any important visual elements (diagrams, flowcharts, annotations).

Be thorough and precise. This extraction will be used by another AI to answer questions about the paper.`

export class PdfAnalyzer {
  constructor(
    private getClient: () => {
      providerClient: BaseLLMProvider<LLMProvider>
      model: ChatModel
    },
    private extractor: PdfExtractor,
  ) {}

  async analyzePage(
    paperId: string,
    pageNum: number,
    focus?: string,
  ): Promise<string> {
    // Check cache first
    const cached = this.extractor.getCachedAnalysis(paperId, pageNum)
    if (cached && !focus) return cached

    const pageImage = await this.extractor.getPageImage(paperId, pageNum)
    const { providerClient, model } = this.getClient()

    const userText = focus
      ? `Analyze this PDF page. Focus on: ${focus}`
      : 'Analyze this PDF page comprehensively.'

    const response = await providerClient.generateResponse(model, {
      model: model.model,
      messages: [
        {
          role: 'system',
          content: ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: pageImage } },
            { type: 'text', text: userText },
          ],
        },
      ],
    })

    const result =
      response.choices[0]?.message?.content ?? 'Analysis failed.'

    // Cache unfocused results
    if (!focus) {
      this.extractor.setCachedAnalysis(paperId, pageNum, result)
    }

    return result
  }
}
