## Context

Smart Composer currently has two view types: ChatView (right sidebar) and ApplyView (modal/tab). This change adds a third view type in the left sidebar — a Zotero-powered library browser for PDF papers. The pane communicates with Zotero's local API at `http://localhost:23119/api` to fetch metadata, search items, and export BibTeX citations.

The user has Zotero running locally with "Allow other applications on this computer to communicate with Zotero" enabled.

### Stakeholders
- Researchers who manage papers in Zotero and write in Obsidian
- Users who store PDF papers in their Obsidian vault

## Goals / Non-Goals

### Goals
- Provide a left-sidebar pane matching Obsidian's native sidebar UX patterns
- Browse PDFs within a user-selected vault folder
- Enrich each PDF with Zotero metadata (title, authors, year, abstract, item type)
- Instant search by title and/or author via Zotero's `q` query parameter
- Date-range filter for papers
- Hover tooltip showing paper abstract
- One-click BibTeX citation copy via Zotero's `format=bibtex` export
- Click to open PDF in Obsidian's built-in PDF viewer
- Toggle-select papers for future functionality
- Snappy, lag-free filtering and searching with debounced inputs

### Non-Goals
- File upload functionality
- Managing Zotero collections or libraries from within Obsidian
- Writing/modifying Zotero data (read-only integration)
- Supporting Zotero web API (only local API)
- Implementing the "Sources" / "Collections" tab toggles from the reference images

## Decisions

### View Registration Pattern
- **Decision**: Follow the existing `ChatView.tsx` pattern — extend `ItemView`, render React tree via `createRoot`, wrap in context providers
- **Rationale**: Consistent with existing codebase; reuses settings/plugin/app contexts

### Left Sidebar Placement
- **Decision**: Use `workspace.getLeftLeaf(false)` to place the view in the left sidebar panel (alongside Files, Search, Bookmarks)
- **Rationale**: Matches user requirement; Obsidian natively supports registering views in the left sidebar via leaf placement

### Zotero API Integration
- **Decision**: Create a dedicated `src/core/zotero/zoteroClient.ts` module wrapping `fetch` calls to `http://localhost:23119/api/users/0/items`
- **Rationale**: Separation of concerns; testable; follows the existing `src/core/` module pattern
- **Key endpoints**:
  - `GET /api/users/0/items?format=json&limit=100&itemType=-attachment&q={query}` — search/list items with metadata
  - `GET /api/users/0/items/{itemKey}?format=bibtex` — export single item as BibTeX
- **Matching PDFs to Zotero items**: Match by filename — Zotero attachment filenames typically match the vault PDF filenames. Fall back to title-based fuzzy matching.

### Search Architecture
- **Decision**: Client-side filtering for instant responsiveness, backed by Zotero API search for comprehensive results
- **Flow**: On folder selection, fetch all items from Zotero matching PDFs in the folder. Cache in React state. Search input filters cached results client-side (debounced 150ms). If cache is stale or user triggers refresh, re-fetch from Zotero API.
- **Rationale**: Zotero local API is fast but network round-trips add latency. Client-side filtering of cached data ensures snappy UX.

### State Management
- **Decision**: React Query for Zotero API calls (caching, refetching), local `useState`/`useMemo` for search term, filters, and selections
- **Rationale**: Consistent with existing TanStack React Query usage in ChatView; provides automatic cache invalidation and loading states

### Paper Card Layout
- **Decision**: Each paper card displays:
  - Top-left: toggle checkbox for selection
  - Top: item type label (e.g., "Article", "Document")
  - Bold title
  - Authors (comma-separated last names)
  - Year
  - "Cite" button (styled like "Add to collection" button in reference image) — copies BibTeX to clipboard
  - Hover: tooltip/popover showing abstract
  - Click: opens the PDF in Obsidian
- **Rationale**: Matches the reference images exactly, minus the excluded elements (Details, Open PDF buttons replaced by hover abstract and click-to-open)

### Date Filter
- **Decision**: Dropdown/popover below search bar with year range selector (from/to year inputs)
- **Rationale**: Simple, effective; avoids complex calendar UI. Filters are applied client-side on cached data for instant response.

## Risks / Trade-offs

- **Zotero not running**: If Zotero isn't running or the API is disabled, all requests will fail. Mitigation: Show a clear error state ("Cannot connect to Zotero. Ensure Zotero is running and local API access is enabled.") with a retry button.
- **PDF-to-Zotero matching accuracy**: Filename matching may not always work (renamed files, duplicates). Mitigation: Fall back to title-based fuzzy matching; show "No metadata found" for unmatched PDFs.
- **Large libraries**: Users with thousands of papers may experience slow initial loads. Mitigation: Paginate Zotero API calls; virtualize the paper list for smooth scrolling.
- **Zotero API rate limits**: Local API has no documented rate limits, but rapid successive calls should be avoided. Mitigation: Debounce search input; cache aggressively.

## Open Questions

- Should the Zotero base URL be configurable in settings (for non-standard ports)? **Proposed: Yes, default to `http://localhost:23119`.**
- Should we support matching PDFs to Zotero items by DOI or other identifiers in addition to filename? **Proposed: Start with filename matching, extend later if needed.**
- What should happen when the selected folder has no PDFs? **Proposed: Show an empty state with "No PDF files found in this folder" message.**
