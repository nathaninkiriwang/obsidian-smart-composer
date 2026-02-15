# Change: Fix library pane bugs and improve UX

## Why

The library pane has several bugs and UX issues: only shows items known to Zotero's API (missing vault-only PDFs), no live reactivity when files change, tooltip covers cards, checkbox shape is wrong, and the overall design feels basic. The pane should reflect the vault directory in real time and feel polished.

## What Changes

1. **Data source**: Switch from Zotero API → vault directory scanning as primary source. Enrich with Zotero metadata where available. This fixes the "only 2 papers" bug (vault has 5 PDFs but Zotero API only knows 2).
2. **Reactive updates**: Use Obsidian vault events (`vault.on('create' | 'delete' | 'rename')`) to update the paper list and collection tree in real time — no reload or sync button needed.
3. **Remove Cite button**: Strip the cite button, BibTeX fetch, and all related logic from PaperCard.
4. **Fix tooltip**: Reposition to top-right corner so it doesn't overlap cards above. Truncate abstract to 4 lines with ellipsis. Shrink tooltip box.
5. **Fix checkbox**: Make it a proper square (remove excessive border-radius, ensure 1:1 aspect ratio).
6. **Remove sync button**: Background sync is always running; the manual sync button in the header is redundant.
7. **Polish UI**: Improve visual design with better card styling, subtle hover interactions, and modern component feel using the `frontend-design` skill.

## Impact

- Affected code: `LibraryPane.tsx`, `PaperCard.tsx`, `AbstractTooltip.tsx`, `PaperList.tsx`, `CollectionSelector.tsx`, `zoteroClient.ts`, `styles.css`
- Affected specs: library-pane (new capability)
- No settings migration needed
- No breaking changes to external APIs
