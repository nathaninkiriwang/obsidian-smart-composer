# PDF Content Extraction

Capability for extracting text and visual content from PDF files via a three-layer pipeline (pdf.js + OCR + vision model) exposed as tool calls to the chat LLM.

## ADDED Requirements

### Requirement: PDF page rendering to images

The system SHALL render individual PDF pages as PNG images using pdf.js, producing base64 data URLs suitable for vision-capable LLMs, with per-page caching.

#### Scenario: Render a single page

**Given** a loaded PDF document with 15 pages
**When** `getPageImage(paperId, 5)` is called
**Then** a PNG data URL at 150 DPI is returned for page 5
**And** the result is cached so subsequent calls return instantly

#### Scenario: Render page for OCR fallback

**Given** a scanned PDF page with <50 chars of extractable text
**When** `getPageImage()` is called for that page
**Then** the rendered image is used as input for Tesseract.js OCR

### Requirement: PDF text extraction with OCR fallback

The system SHALL extract text from PDF pages using pdf.js `getTextContent()` as the primary method, falling back to Tesseract.js OCR when pdf.js yields fewer than 50 characters for a page.

#### Scenario: Normal PDF with embedded text

**Given** a digitally-created PDF paper
**When** text is extracted from page 3
**Then** `getPageText()` returns the pdf.js extracted text
**And** OCR is NOT triggered

#### Scenario: Scanned PDF page

**Given** a scanned PDF where page 2 has only 10 chars from pdf.js
**When** text is extracted from page 2
**Then** Tesseract.js OCR runs on the rendered page image
**And** the OCR text is returned and cached

### Requirement: Dedicated vision model for deep page analysis

The system SHALL provide a dedicated vision-capable LLM (configurable via `pdfExtractionModelId` setting) that analyzes PDF page images and returns structured extraction including figures, LaTeX equations, tables, and formatted text.

#### Scenario: Analyze page with figures and equations

**Given** a PDF page containing a figure, a table, and two equations
**When** `analyzePage(pageImage)` is called on the dedicated model
**Then** the response includes a detailed figure description, a markdown table, and LaTeX notation for both equations
**And** the result is cached per page

#### Scenario: Focused analysis

**Given** a PDF page with multiple content types
**When** `analyzePage(pageImage, "equations")` is called with a focus parameter
**Then** the vision model prioritizes extracting mathematical equations in LaTeX notation

### Requirement: PDF navigation tools for chat LLM

The system SHALL expose five tool functions to the chat LLM when PDF papers are mentioned: `get_pdf_overview`, `get_pdf_page_text`, `get_pdf_page_image`, `analyze_pdf_page`, and `search_pdf`.

#### Scenario: LLM uses tools to answer a question about figures

**Given** the user asks "Describe Figure 3 in @Paper"
**When** the chat LLM processes the message
**Then** the LLM calls `get_pdf_overview` to find the paper structure
**Then** the LLM calls `search_pdf` to find "Figure 3"
**Then** the LLM calls `analyze_pdf_page` on the page containing Figure 3
**And** the LLM synthesizes the answer from the tool results

#### Scenario: LLM navigates a large PDF efficiently

**Given** a 50-page PDF is mentioned
**When** the user asks "What is the main conclusion?"
**Then** the LLM calls `get_pdf_overview` for the table of contents
**Then** the LLM calls `get_pdf_page_text` on the conclusion pages only
**And** the total token cost is far less than sending all 50 pages

### Requirement: Tool call results include multi-modal content

The `get_pdf_page_image` tool SHALL return image content that the LLM can see inline, while `get_pdf_page_text` and `search_pdf` SHALL return text content. The `analyze_pdf_page` tool SHALL return the dedicated model's structured text analysis.

#### Scenario: Page image tool returns visual content

**Given** the LLM calls `get_pdf_page_image(paper_id, 7)`
**When** the tool call is resolved
**Then** the response includes a `ContentPart[]` with an `ImageContentPart` containing the page PNG
**And** the LLM can visually inspect the page in its next reasoning step

### Requirement: MentionablePdf type

A new mentionable type `pdf` SHALL carry a vault TFile reference, Zotero display title, and Zotero key for library sync.

#### Scenario: Serialize and deserialize PDF mentionable

**Given** a `MentionablePdf` with file, title "Attention Is All You Need", and zoteroKey "ABC123"
**When** serialized via `serializeMentionable()`
**Then** produces `{ type: 'pdf', file: 'Library/ML/Vaswani - 2017 - Attention.pdf', title: 'Attention Is All You Need', zoteroKey: 'ABC123' }`
**When** deserialized via `deserializeMentionable()`
**Then** resolves the vault path back to a TFile

### Requirement: Dedicated extraction model setting

The settings SHALL include a `pdfExtractionModelId` field under the `zotero` section that allows the user to select a separate model for PDF page analysis, defaulting to the user's chat model.

#### Scenario: User configures a fast extraction model

**Given** the user sets `pdfExtractionModelId` to "claude-haiku"
**When** `analyze_pdf_page` tool is called
**Then** the analysis request is sent to Claude Haiku, not the main chat model
