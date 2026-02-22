# Change: Add PDF region capture with crosshair selector

## Why

Users reading academic PDFs in Obsidian often want to ask questions about specific figures, tables, equations, or diagrams — not entire pages. The existing `integrate-pdf-chat` system uses LLM-driven tool calls to navigate whole pages, but there's no way for a user to visually select a precise region and send it as context. A crosshair selector that appears on PDF hover lets users capture exactly the visual content they care about with zero friction.

## What Changes

- Add an always-on crosshair overlay that activates when the mouse enters any PDF view in Obsidian
- Click-and-drag draws a selection rectangle over the PDF content
- On release, the selected region is captured as a PNG screenshot from the underlying canvas
- The captured image is automatically inserted into the Smart Composer chat as a `MentionableImage`
- If the chat pane is not open, it opens automatically when a capture is made

## Impact

- Affected specs: none (new capability)
- Affected code:
  - `src/main.ts` — register PDF view detection and overlay lifecycle
  - New `src/core/pdf/PdfRegionCapture.ts` — canvas region extraction
  - New `src/components/pdf-overlay/PdfSelectionOverlay.tsx` — crosshair and rectangle UI
  - `src/components/chat-view/chat-input/ChatUserInput.tsx` — receive captured images
  - `src/utils/llm/image.ts` — possible utility additions for canvas-to-mentionable conversion
