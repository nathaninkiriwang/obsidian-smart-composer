## Context

Obsidian renders PDFs using its built-in PDF viewer (powered by pdf.js internally). Each PDF page is rendered as a `<canvas>` element inside a `.pdf-container` within the workspace leaf. The Smart Composer plugin already has infrastructure for handling images in chat (`MentionableImage`, `ImagePastePlugin`, image-to-base64 utilities) and for PDF processing (`pdfExtractor.ts`). This feature bridges the two: user-driven visual capture from the PDF viewer directly into the chat.

## Goals / Non-Goals

- **Goals:**
  - Allow users to select arbitrary rectangular regions of a rendered PDF and capture them as images
  - Zero-friction activation: crosshair appears automatically on PDF hover
  - Captured images flow into the existing chat image pipeline as `MentionableImage`
  - Works with any PDF open in Obsidian (not just Zotero-synced PDFs)

- **Non-Goals:**
  - PDF annotation or markup
  - Text extraction from the selected region (the LLM handles interpretation)
  - Multi-page region selection (one page at a time)
  - Modifying the underlying PDF file

## Decisions

### 1. DOM overlay approach (not Obsidian API)

**Decision:** Use a transparent DOM overlay positioned on top of the PDF container, detected via DOM queries for `.pdf-container` elements.

**Rationale:** Obsidian does not expose a public API for extending the PDF viewer. DOM-level integration is the only viable approach. The overlay intercepts mouse events for selection while the PDF remains read-only underneath.

**Alternatives considered:**
- *Obsidian API view extension*: No public PDF viewer extension API exists.
- *Re-rendering with our own pdf.js*: Wasteful duplication; Obsidian already renders the pages.

### 2. Canvas pixel extraction for capture

**Decision:** Read pixels directly from the Obsidian-rendered `<canvas>` elements using `canvas.getContext('2d').getImageData()` and compose the selected region into a new canvas, then export as `toDataURL('image/png')`.

**Rationale:** The PDF pages are already rendered at display resolution on canvas. Direct pixel read is instant and avoids re-rendering. Cross-origin restrictions don't apply since the PDF is loaded from the local vault.

**Alternatives considered:**
- *html2canvas*: Unnecessary dependency; the content is already on a canvas.
- *Re-render via pdfExtractor*: Slower, requires loading the PDF again, doesn't match exact scroll/zoom state.

### 3. Selection spans single page only

**Decision:** Constrain the selection rectangle to a single PDF page canvas. If the user drags across page boundaries, clip to the page where the drag started.

**Rationale:** Each page is a separate `<canvas>`. Cross-page compositing adds complexity with little benefit — users typically want a specific figure or section that fits on one page.

### 4. Chat pane auto-open and image insertion

**Decision:** After capture, open the Smart Composer chat pane (if not already open) and add the image as a `MentionableImage` to the current chat input. Do not auto-send — let the user type a prompt about the captured region.

**Rationale:** Users need to formulate a question about the captured content. Auto-sending with no prompt would be unhelpful. Adding as a mentionable badge follows the existing pattern (same as image paste/upload).

### 5. Overlay lifecycle via workspace event listeners

**Decision:** Use `workspace.on('layout-change')` and `workspace.on('active-leaf-change')` to detect when PDF views are opened/closed, then mount/unmount the overlay accordingly. Use a MutationObserver on the PDF container to handle dynamic page loading (scrolling into view).

**Rationale:** Obsidian doesn't fire specific events for PDF views, but layout and leaf changes cover view open/close. MutationObserver handles the lazy-loaded page canvases within a PDF.

## Risks / Trade-offs

- **Always-on crosshair may surprise users** → The overlay only activates on PDF views; a subtle visual cue (cursor change + faint border) signals the mode. Users can still scroll with the scroll wheel.

- **Canvas cross-origin issues** → Mitigated: local vault PDFs are same-origin. External PDFs (if any) might fail silently — capture returns a blank image. We'll add a check and show a notice.

- **Obsidian DOM structure may change** → The overlay depends on `.pdf-container` and `.pdf-page` CSS selectors. These are stable in Obsidian's current PDF viewer but could break on major Obsidian updates. Defensive coding with fallback notices.

- **Scroll/zoom state mismatch** → Capture reads from the live canvas, so it always matches what the user sees. No mismatch risk.

## Open Questions

- None — approach is straightforward given the existing infrastructure.
