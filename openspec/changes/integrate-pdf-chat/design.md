# Design: integrate-pdf-chat

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         Chat LLM (tool-calling)                   │
│  User asks: "What are the key equations in @Paper?"               │
│                                                                    │
│  LLM reasons → calls tools:                                       │
│    1. get_pdf_overview("paper-id")     → metadata + TOC           │
│    2. get_pdf_page_text("paper-id", 3) → raw text of page 3       │
│    3. analyze_pdf_page("paper-id", 5)  → vision model analysis    │
│    4. get_pdf_page_image("paper-id", 7)→ rendered page image       │
│                                                                    │
│  LLM synthesizes answer from tool results                         │
└──────────┬────────────────────────────────────────────────────────┘
           │ tool calls
           ▼
┌───────────────────────────────────────────────────────────────────┐
│                       PdfToolProvider                              │
│  Registers tools with the LLM request                             │
│  Routes tool calls to PdfExtractor                                │
│  Manages per-paper context (which PDFs are mentioned)             │
└──────────┬────────────────────────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────────────────────────────────┐
│                        PdfExtractor                                │
│                                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Layer 1:     │  │ Layer 2:     │  │ Layer 3:                 │ │
│  │ pdf.js       │  │ Tesseract.js │  │ Dedicated Vision Model   │ │
│  │              │  │              │  │                          │ │
│  │ • Page render│  │ • OCR for    │  │ • Deep page analysis     │ │
│  │   to PNG     │  │   scanned    │  │ • Figure descriptions    │ │
│  │ • Text       │  │   pages      │  │ • LaTeX extraction       │ │
│  │   extraction │  │ • Auto-      │  │ • Table parsing          │ │
│  │ • Page cache │  │   triggered  │  │ • Structural reasoning   │ │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘ │
│                                                                    │
│  Page Cache: Map<paperId, Map<pageNum, CachedPage>>               │
└───────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    PaperSelectionStore                             │
│  (plugin-level EventEmitter for bidirectional sync)               │
│  selectedPapers: Map<zoteroKey, PaperMetadata>                    │
│  availablePapers: PaperMetadata[]                                 │
├──────────────────────┬───────────────────────────────────────────┤
│   Library Pane       │        Chat Input                          │
│   (left sidebar)     │        (bottom panel)                      │
│                      │                                             │
│  checkbox toggle ──► │ ◄── @mention adds to selection             │
│  ◄── selection state │ ──► selection state renders chips          │
└──────────────────────┴───────────────────────────────────────────┘
```

## 1. PDF Extraction Pipeline — Three Layers

### Layer 1: pdf.js (always runs first)

**Module:** `src/core/pdf/pdfExtractor.ts`

pdf.js (pdfjs-dist) is Mozilla's battle-tested PDF renderer. It runs natively in Electron and provides:
- Page rendering to canvas (for image extraction)
- Structured text extraction via `page.getTextContent()`
- No external binary dependencies

```typescript
class PdfExtractor {
  private pageCache = new Map<string, Map<number, CachedPage>>()

  // Load and cache a PDF document
  async loadDocument(paperId: string, data: ArrayBuffer): Promise<PdfDocument>

  // Render a single page to PNG data URL (cached)
  async getPageImage(paperId: string, pageNum: number, dpi?: number): Promise<string>

  // Extract text from a page range (cached)
  async getPageText(paperId: string, pageNum: number): Promise<string>

  // Get full document text (all pages concatenated)
  async getFullText(paperId: string): Promise<string>

  // Detect if a page is scanned (text extraction yields <50 chars)
  async isScannedPage(paperId: string, pageNum: number): Promise<boolean>

  // Get document metadata (page count, title from PDF metadata)
  async getMetadata(paperId: string): Promise<PdfMetadata>
}

type CachedPage = {
  imageDataUrl: string | null    // rendered PNG, null if not yet rendered
  text: string | null            // extracted text, null if not yet extracted
  ocrText: string | null         // OCR text for scanned pages
  analysisResult: string | null  // vision model analysis result
}

type PdfDocument = {
  paperId: string
  pageCount: number
  metadata: PdfMetadata
}

type PdfMetadata = {
  title: string
  author: string
  pageCount: number
  isScanned: boolean  // true if >50% of pages detected as scanned
}
```

**Rendering approach:**
- Use `OffscreenCanvas` for rendering (works in Electron workers)
- Default 150 DPI for analysis, 72 DPI for thumbnails
- PNG format for lossless quality of text/equations
- Cache page images after first render

### Layer 2: Tesseract.js OCR

**Triggered automatically** when pdf.js text extraction yields <50 characters for a page.

```typescript
// In PdfExtractor
async getPageText(paperId: string, pageNum: number): Promise<string> {
  const cached = this.getCache(paperId, pageNum)
  if (cached?.text !== null) return cached.text

  // Try pdf.js text extraction first
  const pdfText = await this.extractPdfJsText(paperId, pageNum)

  if (pdfText.length >= 50) {
    this.cacheText(paperId, pageNum, pdfText)
    return pdfText
  }

  // Scanned page detected — run OCR
  const imageData = await this.getPageImage(paperId, pageNum)
  const ocrResult = await this.runOcr(imageData)
  this.cacheText(paperId, pageNum, ocrResult)
  return ocrResult
}
```

**Tesseract.js configuration:**
- English language pack (eng.traineddata) bundled with plugin
- Single-page recognition (no need for multi-page pipeline)
- WebAssembly execution in Electron (fast, no external deps)

### Layer 3: Dedicated Vision Model

**A separately configured vision-capable LLM** called via `analyze_pdf_page` tool.

This is the "deep analysis" layer. The chat LLM calls this tool when it needs to understand visual content (figures, equations, complex tables) that text extraction alone can't capture.

```typescript
class PdfAnalyzer {
  constructor(
    private getClient: () => ChatModelClient,  // dedicated extraction model
  ) {}

  async analyzePage(pageImage: string, context?: string): Promise<string> {
    const response = await this.getClient().chat({
      messages: [
        {
          role: 'system',
          content: ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: pageImage } },
            {
              type: 'text',
              text: context
                ? `Analyze this PDF page. User context: ${context}`
                : 'Analyze this PDF page comprehensively.',
            },
          ],
        },
      ],
      model: this.modelId,
    })
    return response.content
  }
}
```

**Analysis system prompt** instructs the vision model to:
1. Extract all visible text with formatting preserved
2. Describe every figure, chart, and plot in detail (axes, trends, key values)
3. Extract all mathematical equations in LaTeX notation
4. Parse tables into markdown format with headers and alignment
5. Note any important visual elements (diagrams, flowcharts, algorithms)
6. Preserve the logical reading order of the page

**Dedicated model setting:**
- New field in settings: `pdfExtractionModelId`
- Defaults to user's chat model but can be overridden
- Recommended: a fast vision model (e.g., Claude Haiku, GPT-4o-mini) for cost efficiency
- The user can also set a high-quality model (e.g., Claude Sonnet) for research-grade extraction

## 2. PDF Tool Definitions

### Tool: `get_pdf_overview`

```json
{
  "name": "get_pdf_overview",
  "description": "Get an overview of a PDF paper including metadata, page count, and a table of contents extracted from the text. Call this first to understand the paper's structure before diving into specific pages.",
  "parameters": {
    "type": "object",
    "properties": {
      "paper_id": { "type": "string", "description": "The paper identifier" }
    }
  }
}
```

**Returns:** Title, authors, page count, abstract (from first page text), detected section headings with page numbers, whether the PDF is scanned.

**Cost:** Reads cached text only — no LLM calls.

### Tool: `get_pdf_page_text`

```json
{
  "name": "get_pdf_page_text",
  "description": "Get the extracted text content from specific pages of a PDF. Uses OCR automatically for scanned documents. Best for reading text-heavy content.",
  "parameters": {
    "type": "object",
    "properties": {
      "paper_id": { "type": "string" },
      "start_page": { "type": "number", "description": "1-indexed start page" },
      "end_page": { "type": "number", "description": "1-indexed end page (inclusive). Max 5 pages per call." }
    }
  }
}
```

**Returns:** Extracted text for each page (pdf.js or OCR). Max 5 pages per call to control context size.

**Cost:** Minimal (cached text). May trigger OCR on first call for scanned pages.

### Tool: `get_pdf_page_image`

```json
{
  "name": "get_pdf_page_image",
  "description": "Get a rendered image of a specific PDF page. Use this when you need to see the visual layout, figures, or equations directly. Returns the page as a high-resolution image.",
  "parameters": {
    "type": "object",
    "properties": {
      "paper_id": { "type": "string" },
      "page": { "type": "number", "description": "1-indexed page number" }
    }
  }
}
```

**Returns:** PNG data URL of the rendered page at 150 DPI.

**Cost:** 1 image in context (cached after first render).

### Tool: `analyze_pdf_page`

```json
{
  "name": "analyze_pdf_page",
  "description": "Perform deep analysis of a PDF page using a vision model. Returns structured extraction including figure descriptions, LaTeX equations, table data, and formatted text. More thorough than get_pdf_page_text but costs an additional model call. Use for pages with important figures, equations, or complex layouts.",
  "parameters": {
    "type": "object",
    "properties": {
      "paper_id": { "type": "string" },
      "page": { "type": "number" },
      "focus": { "type": "string", "description": "Optional: specific aspect to focus on (e.g., 'equations', 'figures', 'tables')" }
    }
  }
}
```

**Returns:** Structured analysis from the dedicated vision model. Result is cached.

**Cost:** 1 call to the dedicated extraction model (cached after first call).

### Tool: `search_pdf`

```json
{
  "name": "search_pdf",
  "description": "Search for specific text within a PDF document. Returns matching page numbers and surrounding context. Useful for finding where specific topics, equations, or terms appear.",
  "parameters": {
    "type": "object",
    "properties": {
      "paper_id": { "type": "string" },
      "query": { "type": "string", "description": "Text to search for" }
    }
  }
}
```

**Returns:** List of matches with page number, line context, and character position.

**Cost:** Minimal (searches cached text).

## 3. Tool Integration with Chat

### PdfToolProvider

```typescript
class PdfToolProvider {
  constructor(
    private extractor: PdfExtractor,
    private analyzer: PdfAnalyzer,
    private vault: Vault,
  ) {}

  // Returns tool definitions for papers mentioned in the current message
  getToolDefinitions(mentionedPapers: MentionablePdf[]): RequestTool[]

  // Handle a tool call from the LLM
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string | ContentPart[]>
}
```

**Integration point:** In `promptGenerator.ts`:
1. Detect `MentionablePdf` mentionables in the user's message
2. Load each PDF into `PdfExtractor` (read binary from vault)
3. Add PDF tool definitions to the LLM request's `tools` array
4. Add a system message listing available papers with their IDs and metadata
5. Handle tool call responses in the streaming loop

**System message addition when PDFs are mentioned:**
```
You have access to the following PDF papers. Use the PDF tools to read their content.
Do NOT guess or assume content — always use the tools to verify.

Papers:
- paper_abc: "Attention Is All You Need" (Vaswani et al., 2017) — 15 pages
- paper_def: "BERT: Pre-training" (Devlin et al., 2019) — 16 pages

Available tools: get_pdf_overview, get_pdf_page_text, get_pdf_page_image, analyze_pdf_page, search_pdf
```

## 4. New Mentionable Type: MentionablePdf

```typescript
// Runtime type
type MentionablePdf = {
  type: 'pdf'
  file: TFile           // vault PDF file
  title: string         // Zotero title (display name)
  zoteroKey: string     // for library sync
}

// Serialized type (for persistence)
type SerializedMentionablePdf = {
  type: 'pdf'
  file: string          // vault path
  title: string
  zoteroKey: string
}
```

Distinct from `MentionableFile` because:
- Carries Zotero metadata (title, key) for display and sync
- Triggers tool-based extraction pipeline instead of `vault.cachedRead()`
- Produces tool definitions, not inline content

## 5. Scoped @ Mention Search

### Modified fuzzySearch API

```typescript
type FuzzySearchOptions = {
  scope?: 'all' | 'pdf-collection'
  papers?: PaperMetadata[]   // available papers from Zotero API
}

function fuzzySearch(
  app: App,
  query: string,
  options?: FuzzySearchOptions
): SearchableMentionable[]
```

When `scope === 'pdf-collection'`:
- Only search within the provided `papers[]` list
- Each result maps to a `MentionablePdf` instead of `MentionableFile`
- Display paper title (not filename) in dropdown
- Exclude vault/folder results — only PDF papers

### New: `fuzzySearchPdfs()`

Dedicated search function for PDF papers:
```typescript
function fuzzySearchPdfs(
  papers: PaperMetadata[],
  query: string,
  app: App,
): MentionablePdf[]
```

Uses fuzzysort on paper titles and author names. Returns results with vault file references resolved from `pdfPath`.

## 6. Bidirectional Library ↔ Chat Sync

### PaperSelectionStore (plugin-level)

Since the library pane and chat are in **separate React roots** (different Obsidian views), we use a plugin-level EventEmitter store, not React context.

```typescript
class PaperSelectionStore extends EventEmitter {
  private selected = new Map<string, PaperMetadata>()
  private available: PaperMetadata[] = []

  addPaper(paper: PaperMetadata): void
  removePaper(zoteroKey: string): void
  clear(): void
  isSelected(zoteroKey: string): boolean
  getSelected(): PaperMetadata[]

  setAvailablePapers(papers: PaperMetadata[]): void
  getAvailablePapers(): PaperMetadata[]

  // Events: 'change', 'available-change'
}
```

### React hook

```typescript
function usePaperSelection(): {
  selectedPapers: Map<string, PaperMetadata>
  availablePapers: PaperMetadata[]
  addPaper: (paper: PaperMetadata) => void
  removePaper: (key: string) => void
  isSelected: (key: string) => boolean
}
```

Subscribes to the store via `usePlugin().paperSelection` and returns reactive state using `useSyncExternalStore` or `useState` + `useEffect`.

### Sync Flows

**Library → Chat:** checkbox → `store.addPaper()` → ChatUserInput subscribes → adds MentionablePdf chip

**Chat → Library:** MentionPlugin.onSelectOption → `store.addPaper()` → LibraryPane subscribes → checkbox checked

**Deletion:** chip removed or mention deleted → `store.removePaper()` → both views update

**New chat:** `store.clear()` → all checkboxes uncheck, all chips removed

## 7. Settings Changes

New settings fields:
```typescript
zotero: {
  // existing fields...
  pdfExtractionModelId: string  // model for Layer 3 analysis (default: same as chatModelId)
}
```

Settings UI: dropdown in Zotero section to select extraction model from configured providers.

## 8. File Dependency Map

```
NEW FILES:
  src/core/pdf/pdfExtractor.ts           — pdf.js rendering + text extraction + page cache
  src/core/pdf/pdfAnalyzer.ts            — dedicated vision model analysis wrapper
  src/core/pdf/pdfToolProvider.ts         — tool definitions + tool call handler
  src/core/pdf/ocrEngine.ts              — Tesseract.js OCR wrapper
  src/core/paper-selection/store.ts       — PaperSelectionStore (EventEmitter)
  src/hooks/usePaperSelection.ts          — React hook for store subscription

MODIFIED FILES:
  src/types/mentionable.ts               — add MentionablePdf, SerializedMentionablePdf
  src/utils/fuzzy-search.ts              — add fuzzySearchPdfs() + scope option
  src/utils/chat/mentionable.ts          — serialize/deserialize MentionablePdf
  src/utils/chat/promptGenerator.ts      — register PDF tools, handle tool calls
  src/components/chat-view/
    Chat.tsx                             — initialize PdfToolProvider, pass to stream manager
    ChatUserInput.tsx                    — subscribe to paper selection store
    MentionableBadge.tsx                 — render PDF badge variant
    useChatStreamManager.ts             — handle PDF tool call responses
    plugins/mention/MentionPlugin.tsx    — use scoped search
  src/components/library-view/
    LibraryPane.tsx                      — publish to/subscribe from PaperSelectionStore
    PaperCard.tsx                        — sync checkbox with shared store
  src/settings/schema/setting.types.ts   — add pdfExtractionModelId
  src/settings/schema/migrations/        — new migration for pdfExtractionModelId
  src/main.ts                            — instantiate PaperSelectionStore, PdfExtractor
  package.json                           — add pdfjs-dist, tesseract.js
  esbuild.config.mjs                     — configure pdf.js worker + tesseract worker bundling
```
