# integrate-pdf-chat

## Summary

Enable the AI chatbot to read and understand PDF papers — including figures, plots, tables, and LaTeX equations — using an agent-based extraction pipeline with tool calls, OCR, and a dedicated vision model. Connect the library pane to the chat via bidirectional selection sync.

## Problem

1. The chat cannot read PDF files. The `@` mention system only supports `.md` files (`fuzzy-search.ts` line 131 filters to `extension === 'md'`). PDFs contain rich non-textual content (figures, charts, tables, equations) that text-only extraction would miss.
2. The `@` file picker searches **all vault files** instead of scoping to the user's current Zotero collection.
3. The library pane and chat are disconnected — selecting a paper in the library does not add it to the chat, and `@`-mentioning a paper does not reflect in the library checkboxes.

## Approach

### PDF Content Extraction — Agent-based with lazy per-page tool calls

**State-of-the-art method: The chat LLM navigates PDFs interactively via tool calls, with a dedicated vision model for deep page analysis.**

Instead of pre-extracting entire PDFs upfront (wasteful for large papers), the system provides the chat LLM with **PDF navigation tools**. The LLM decides which pages to examine based on the user's question, and can drill into specific pages for detailed figure/equation/table analysis.

**Three-layer extraction pipeline:**

1. **Layer 1 — pdf.js (always available, instant):**
   - Render pages to PNG images via OffscreenCanvas
   - Extract raw text via `getTextContent()` API
   - Detect scanned PDFs (pages with minimal extractable text)
   - All rendering cached per-page for instant repeat access

2. **Layer 2 — Tesseract.js OCR (for scanned PDFs):**
   - When pdf.js text extraction yields <50 chars per page, trigger OCR
   - Tesseract.js runs in Electron (WebAssembly) — no external dependencies
   - Produces searchable text from scanned/image-based PDFs

3. **Layer 3 — Dedicated Vision Model (deep analysis):**
   - A separately configurable vision-capable model (e.g., Claude Haiku for speed, Sonnet for quality)
   - Called via `analyze_pdf_page` tool when the chat LLM needs structured understanding
   - The vision model receives the page image and returns:
     - Structured text with formatting preserved
     - Figure descriptions with detailed visual content
     - LaTeX equations extracted in proper notation
     - Tables parsed into markdown format
     - Key visual observations

**Tool-call architecture (lazy per-page):**

When PDFs are mentioned, the chat LLM gets access to these tools:

| Tool | Purpose | Cost |
|------|---------|------|
| `get_pdf_overview` | Returns metadata + page count + table of contents (from text) | Minimal |
| `get_pdf_page_text` | Returns extracted text for a page range | Minimal |
| `get_pdf_page_image` | Returns a rendered page as an image | 1 image token cost |
| `analyze_pdf_page` | Calls dedicated vision model for deep page analysis | 1 model call |
| `search_pdf` | Full-text search within the PDF | Minimal |

The LLM navigates intelligently — e.g., for "summarize the key findings", it might:
1. Call `get_pdf_overview` to see the structure
2. Call `get_pdf_page_text` on abstract + conclusion pages
3. Call `analyze_pdf_page` on pages with figures referenced in the conclusion

This is token-efficient: a 50-page paper might only need 5-8 tool calls instead of sending all 50 pages.

**Why this is state-of-the-art:**
- The LLM acts as an intelligent document navigator, not a blind text dump
- Figures, plots, tables are analyzed by a vision model — not lost in text extraction
- LaTeX equations are recovered from rendered images — no brittle regex parsing
- OCR handles scanned PDFs automatically
- Lazy loading means 100+ page PDFs work efficiently
- Tool-based architecture is model-agnostic (works with any tool-calling LLM)
- All Node.js — no Python, no external binaries, works in any Obsidian installation

### Scoped @ Mentions

- When the user types `@` in the chat, the file picker shows **only PDF papers from the current Zotero collection** (or all items if no collection is selected).
- The dropdown displays paper titles (from Zotero metadata) rather than raw filenames.
- Multiple PDFs can be referenced via multiple `@` mentions in the same message.

### Library ↔ Chat Bidirectional Sync

- **Library → Chat:** Checking a paper's checkbox in the library pane immediately adds it as a mentionable in the active chat input (appears as a chip above the text area).
- **Chat → Library:** When a PDF is `@`-mentioned in the chat, the corresponding paper's checkbox in the library pane is automatically checked.
- Uses a shared selection store (plugin-level EventEmitter) accessible by both the library pane and chat components.

## Scope

- New: `PdfExtractor` class (pdf.js + Tesseract.js + page cache).
- New: `PdfToolProvider` — registers PDF navigation tools with the chat LLM.
- New: `MentionablePdf` type with Zotero metadata.
- New: Dedicated extraction model setting (`pdfExtractionModelId`).
- Modified: `fuzzySearch()` to accept scoped search (PDF-only, collection-filtered).
- Modified: `MentionPlugin.tsx` to use scoped search when in library-connected mode.
- Modified: `promptGenerator.ts` to register PDF tools and handle PDF mentionables.
- New: Shared `PaperSelectionStore` for bidirectional sync.
- Modified: `LibraryPane.tsx` and `ChatUserInput.tsx` to consume/produce selection events.
- New dependencies: `pdfjs-dist`, `tesseract.js`.

## Out of scope

- PDF annotation/highlighting within the chat.
- Automatic RAG indexing of PDF content (future enhancement).
- PDF editing or modification.
- Non-English OCR language packs (English by default, extensible later).
