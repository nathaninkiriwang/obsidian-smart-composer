## 1. PDF content extraction pipeline

- [x] 1.1 Install `pdfjs-dist` and configure esbuild to bundle the pdf.js worker (add to externals or copy worker file).
- [x] 1.2 Create `src/core/pdf/pdfExtractor.ts` — implement page rendering to PNG data URLs via OffscreenCanvas, text extraction via `getTextContent()`, OCR fallback via tesseract.js, and per-page caching.
- [x] 1.3 Implement lazy per-page tool-calling architecture (5 tools: get_pdf_overview, get_pdf_page_text, get_pdf_page_image, analyze_pdf_page, search_pdf) instead of upfront extraction, allowing the LLM to navigate PDFs interactively.
- [ ] 1.4 Write unit tests for `pdfExtractor` using a small test PDF (verify page count, text presence, image data URL format).

## 2. MentionablePdf type

- [x] 2.1 Add `MentionablePdf` and `SerializedMentionablePdf` types to `src/types/mentionable.ts`. Fields: `type: 'pdf'`, `file: TFile`, `title: string`, `zoteroKey: string`.
- [x] 2.2 Update `serializeMentionable()` and `deserializeMentionable()` in `src/utils/chat/mentionable.ts` to handle the `pdf` type.
- [x] 2.3 Add PDF badge variant to `MentionableBadge.tsx` — show PDF icon and paper title instead of filename.

## 3. Prompt generator PDF support

- [x] 3.1 Create `PdfToolProvider` (`src/core/pdf/pdfToolProvider.ts`) with `preparePdfTools()` that loads PDFs and returns tools + system message, and `handleToolCall()` for routing.
- [x] 3.2 Create `PdfAnalyzer` (`src/core/pdf/pdfAnalyzer.ts`) — vision model wrapper for deep page analysis using the configured extraction model.
- [x] 3.3 Integrate into `promptGenerator.ts` — collect PDF mentionables, call `preparePdfTools()`, return tools alongside request messages.
- [x] 3.4 Update `responseGenerator.ts` — merge PDF tools with MCP tools, auto-approve PDF tool calls, route through `PdfToolProvider.handleToolCall()`.
- [ ] 3.5 Test with a real PDF in Obsidian — verify the LLM receives and understands page images, can describe figures and equations.

## 4. Scoped @ mention search

- [x] 4.1 Create `fuzzySearchPdfs(papers: PaperMetadata[], query: string, app: App): MentionablePdf[]` in `src/utils/fuzzy-search.ts` — fuzzy match on paper title and authors, return `MentionablePdf` results.
- [x] 4.2 Modify `MentionPlugin.tsx` to handle `pdf` type in `MentionTypeaheadOption` and show subtitle for PDF results.
- [x] 4.3 Update `LexicalContentEditable.tsx` `searchResultByQuery` to show PDF results first when Zotero papers are available.

## 5. Shared PaperSelectionStore

- [x] 5.1 Create `src/core/paper-selection/store.ts` — subscription-based store with `selectedPapers: Map<string, PaperMetadata>`, `availablePapers: PaperMetadata[]`, and `add/remove/clear` methods.
- [x] 5.2 Instantiate the store in `SmartComposerPlugin` (`main.ts`) as `this.paperSelection`.
- [x] 5.3 Create `usePaperSelection()` hook using `useSyncExternalStore` that subscribes to the store via `usePlugin().paperSelection` and returns reactive state.

## 6. Library → Chat sync

- [x] 6.1 Update `LibraryPane.tsx` `handleTogglePaper` to call `paperSelection.addPaper()` / `paperSelection.removePaper()` using shared store.
- [x] 6.2 Update `PaperCard.tsx` and `PaperList.tsx` to use `Map<string, PaperMetadata>` from shared store for checkbox state.
- [x] 6.3 Update `Chat.tsx` to subscribe to `paperSelection` changes and add/remove `MentionablePdf` mentionables when papers are selected/deselected externally.

## 7. Chat → Library sync

- [x] 7.1 In `ChatUserInput.tsx` `handleMentionNodeMutation`: when a PDF mention node is created, call `paperSelection.addPaper()`.
- [x] 7.2 In `ChatUserInput.tsx` `handleMentionNodeMutation`: when a PDF mention node is destroyed, call `paperSelection.removePaper()`.
- [x] 7.3 In `ChatUserInput.tsx` `handleMentionableDelete`: sync badge deletion to store.

## 8. Selection lifecycle

- [x] 8.1 Clear paper selection when a new chat is started (`paperSelection.clear()` in new-chat handler).
- [x] 8.2 When `LibraryPane` fetches papers (on collection change), update `paperSelection.setAvailablePapers()`.
- [ ] 8.3 When chat loads from history, restore paper selection from persisted `MentionablePdf` mentionables.

## 9. Build and verify

- [x] 9.1 Run `tsc --noEmit`, `npm test`, `npm run build` — all pass.
- [ ] 9.2 Manual end-to-end test: select paper in library → appears in chat → ask about figures/equations → verify LLM reads the PDF images.
- [ ] 9.3 Manual test: @mention a paper → checkbox syncs → remove mention → checkbox unchecks.
