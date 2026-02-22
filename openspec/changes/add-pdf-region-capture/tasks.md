## 1. PDF view detection and overlay mounting

- [x] 1.1 Create `src/core/pdf/PdfViewDetector.ts` — listens to `workspace.on('layout-change')` and `workspace.on('active-leaf-change')` to find workspace leaves rendering PDFs (by querying for `.pdf-container` elements). Returns references to active PDF container DOM elements.
- [x] 1.2 Create `src/core/pdf/PdfSelectionOverlay.ts` — a vanilla DOM class (not React) that creates a transparent overlay `<div>` positioned absolutely over a given PDF container element. Sets `cursor: crosshair` on hover. Includes mount/unmount methods with cleanup.
- [x] 1.3 Wire up in `src/main.ts` — on plugin load, instantiate `PdfViewDetector`, subscribe to PDF view changes, and mount/unmount `PdfSelectionOverlay` instances accordingly. Cleanup on plugin unload.

## 2. Crosshair selection rectangle

- [x] 2.1 Implement mouse event handlers in `PdfSelectionOverlay` — `mousedown` starts selection, `mousemove` draws rectangle, `mouseup` completes selection. Track drag origin and current position in page-relative coordinates.
- [x] 2.2 Render the selection rectangle as a child `<div>` with a visible border (`2px dashed` accent color) and semi-transparent background, positioned and sized dynamically during drag.
- [x] 2.3 Constrain selection to the single PDF page canvas where the drag started — identify the page element (`.pdf-page`) containing the mousedown target and clip the rectangle to its bounds.
- [x] 2.4 Add Escape key handler to cancel an in-progress selection. Add minimum size threshold (10x10px) to ignore accidental clicks.

## 3. Canvas region capture

- [x] 3.1 Create `src/core/pdf/PdfRegionCapture.ts` — given a PDF page canvas element and a selection rectangle (x, y, width, height in CSS pixels), compute the device-pixel-ratio-adjusted coordinates, use `canvas.getContext('2d').getImageData()` to extract the region, draw onto a temporary canvas, and return `toDataURL('image/png')`.
- [x] 3.2 Handle high-DPI displays — scale selection coordinates using canvas width/height vs clientWidth/clientHeight ratio.
- [x] 3.3 Add error handling — if canvas read fails (e.g., tainted canvas from external PDF), show an Obsidian `Notice` with an error message instead of inserting a blank image.

## 4. Image insertion into chat

- [x] 4.1 Create a plugin-level method `captureRegionToChat(image: MentionableImage)` on `SmartComposerPlugin` that: (a) opens the Smart Composer chat view if not already visible, (b) calls `ChatView.addImageToChat()` to insert the image, and (c) reveals the chat leaf and focuses the input.
- [x] 4.2 Add `addImageToChat` to `ChatRef` (Chat.tsx) and `ChatView` (ChatView.tsx) to plumb the image through to `setInputMessage`.
- [x] 4.3 Ensure multiple captures accumulate as separate `MentionableImage` badges without replacing previous ones (deduplication by key).

## 5. Visual polish and UX

- [x] 5.1 Add CSS styles for the overlay and selection rectangle to `styles.css` — crosshair cursor, selection rectangle appearance with accent color.
- [x] 5.2 Add a brief flash animation on successful capture (`.smtcmp-pdf-selection-rect--captured` class with background transition).
- [x] 5.3 Ensure the overlay does not interfere with PDF scrolling (pass through wheel events by temporarily disabling pointer-events).

## 6. Build and verify

- [x] 6.1 Run `tsc --noEmit`, `npm run lint:check` (on new files), `npm test`, `npm run build` — all pass.
- [ ] 6.2 Manual test: open a PDF in Obsidian → hover shows crosshair → drag to select region → image appears in chat input.
- [ ] 6.3 Manual test: capture multiple regions → all appear as separate image badges → type a prompt and send → LLM receives all images.
- [ ] 6.4 Manual test: close PDF view → overlay removed → no orphaned event listeners (check dev tools).
