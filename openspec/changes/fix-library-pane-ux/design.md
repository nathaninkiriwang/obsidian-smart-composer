## Context

The library pane currently fetches papers exclusively from Zotero's local API. This means only items registered in Zotero appear—PDFs synced to the vault by the background sync script (or added manually) are invisible to the pane. The user has 5 PDFs in `~/vault/Library/` but the Zotero API only returns 2 items.

The user expects the pane to be a live view of the vault's Library folder, not a Zotero API browser.

## Goals / Non-Goals

**Goals:**
- Pane reflects vault Library directory contents in real time
- Zero manual refresh — vault events drive updates
- Zotero metadata (title, authors, year, abstract) enriches the display when available
- Clean, professional UI without clutter (no cite button, no sync button)

**Non-Goals:**
- Full Zotero integration (sync, write-back, etc.)
- Mobile platform support (vault events + fs.watch are desktop-only)
- Virtualized rendering (premature for typical library sizes)

## Decisions

### Data source: vault scanning instead of Zotero API

**Decision:** Scan the vault's Library folder for PDFs using Obsidian's vault API. Use the folder structure as the collection tree. Optionally enrich with Zotero metadata by matching filenames to API items.

**Rationale:** The vault is the source of truth — the standalone sync script already organizes PDFs by collection. The pane should show what's actually on disk.

**Approach:**
1. `CollectionSelector` reads vault subfolders under `Library/` (e.g., `Library/PhD/Forecasting...`) as "collections"
2. `LibraryPane` lists PDFs in the selected folder (or all folders)
3. On mount, fetch Zotero metadata in background for enrichment. If Zotero is unavailable, still show PDFs with filename-derived titles.
4. Cache the Zotero metadata map (`filename → metadata`) so enrichment doesn't block rendering.

### Reactive updates: Obsidian vault events

**Decision:** Use `plugin.registerEvent(vault.on('create' | 'delete' | 'rename', ...))` to trigger state updates.

**Rationale:** Obsidian already fires events when files change in the vault. These events are reliable, low-cost, and don't require custom file watchers. The pane re-derives its paper list from vault contents when any PDF in the Library folder changes.

**Approach:**
- `LibraryPane` registers vault event listeners on mount, unregisters on unmount
- Events filter for changes under the library vault path
- Debounce updates (200ms) to avoid rapid re-renders during bulk operations

### Tooltip positioning: top-right corner

**Decision:** Position the abstract tooltip at the top-right of the card using `position: fixed` relative to the card's bounding rect, computed dynamically.

**Alternative considered:** `position: absolute; top: 0; right: 0; transform: translate(100%, 0)` — simpler CSS but clips in narrow sidebars. Using fixed positioning with JS-calculated coords avoids overflow.

### Zotero metadata enrichment fallback

**Decision:** When Zotero API is unavailable, derive paper info from the PDF filename:
- Parse `Author et al. - Year - Title.pdf` pattern (Zotero's default naming)
- Fall back to raw filename if pattern doesn't match

## Risks / Trade-offs

- **Zotero down:** If Zotero isn't running, papers still appear but without abstracts or structured metadata. Acceptable trade-off since the pane is primarily a file browser.
- **Large libraries:** Scanning hundreds of PDFs on each vault event could be slow. Mitigated by only re-scanning the affected folder, not the entire tree.

## Open Questions

None — all requirements are specified in the user's request.
