## 1. Data source and reactivity

- [x] 1.1 Rewrite `LibraryPane.tsx` to scan vault Library folder for PDFs instead of fetching from Zotero API. Use `app.vault.getAbstractFileByPath()` + recursive TFolder/TFile traversal.
- [x] 1.2 Rewrite `CollectionSelector.tsx` to build collection tree from vault subfolder structure under `Library/` instead of Zotero API collections.
- [x] 1.3 Add background Zotero metadata enrichment: on mount, fetch items from Zotero API, build a `filename → PaperMetadata` map, and merge into the vault-scanned paper list. If Zotero is down, parse metadata from filenames.
- [x] 1.4 Register Obsidian vault events (`create`, `delete`, `rename`) in `LibraryPane` to reactively update the paper list and collection tree when files change under the Library path. Debounce at 200ms.

## 2. Remove Cite button

- [x] 2.1 Remove the Cite button JSX, handler, and CSS from `PaperCard.tsx`.
- [x] 2.2 Remove `handleCite` and `getItemBibtex` usage from `LibraryPane.tsx`.
- [x] 2.3 Remove `onCite` prop from `PaperList.tsx` and `PaperCard.tsx`.
- [x] 2.4 Remove `.smtcmp-library-paper-cite*` CSS rules from `styles.css`.

## 3. Fix tooltip

- [x] 3.1 Reposition `AbstractTooltip` to appear at the top-right of the hovered card (not above it). Use `position: fixed` with JS-computed coordinates from `getBoundingClientRect()`.
- [x] 3.2 Truncate abstract text to 4 lines with CSS (`-webkit-line-clamp: 4`) followed by ellipsis.
- [x] 3.3 Reduce tooltip max-width to ~280px and remove `overflow-y: auto` / `max-height`.

## 4. Fix checkbox shape

- [x] 4.1 Update `.smtcmp-library-checkbox-box` CSS: set `border-radius: 3px` (proper square with slight rounding), ensure 15x15px with refined border.

## 5. Remove sync button

- [x] 5.1 Remove the sync button JSX from `LibraryPane.tsx` header.
- [x] 5.2 Remove `handleSync`, `syncing` state, and related sync-button CSS (`.smtcmp-library-sync-*`, `@keyframes smtcmp-spin`).

## 6. Polish UI design

- [x] 6.1 Use the `frontend-design` skill to redesign the library pane with modern, professional styling: improved card layout, better typography hierarchy, subtle hover/active states, smooth transitions, and refined spacing.
- [x] 6.2 Ensure dark mode compatibility using Obsidian CSS variables.

## 7. Build and verify

- [x] 7.1 Run `npx tsc --noEmit`, `npm test`, `npm run build` — all must pass.
- [ ] 7.2 Manual verification in Obsidian: add/remove a PDF in vault Library folder and confirm the pane updates instantly.
