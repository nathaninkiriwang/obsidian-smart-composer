## 1. Core Infrastructure

- [ ] 1.1 Add `LIBRARY_VIEW_TYPE = 'smtcmp-library-view'` to `src/constants.ts`
- [ ] 1.2 Add Zotero settings fields to `src/settings/schema/setting.types.ts` (zoteroApiBaseUrl, selectedLibraryFolder)
- [ ] 1.3 Create settings migration for new Zotero fields in `src/settings/schema/migrations/`
- [ ] 1.4 Add Zotero settings section in `src/components/settings/sections/`

## 2. Zotero API Client

- [ ] 2.1 Create `src/types/zotero.types.ts` with TypeScript types for Zotero item metadata (ZoteroItem, ZoteroCreator, etc.)
- [ ] 2.2 Create `src/core/zotero/zoteroClient.ts` with methods: `fetchItems()`, `searchItems(query)`, `getItemBibtex(itemKey)`, `testConnection()`
- [ ] 2.3 Implement PDF-to-Zotero item matching logic (by attachment filename, with fuzzy title fallback)

## 3. View Registration

- [ ] 3.1 Create `src/LibraryView.tsx` following the `ChatView.tsx` pattern (extend ItemView, React root, context providers)
- [ ] 3.2 Register the view in `src/main.ts` via `registerView(LIBRARY_VIEW_TYPE, ...)`
- [ ] 3.3 Add ribbon icon and command for opening the library pane
- [ ] 3.4 Implement `activateLibraryView()` method to open view in left sidebar via `getLeftLeaf(false)`

## 4. React Components

- [ ] 4.1 Create `src/components/library-view/LibraryPane.tsx` — root component with state management
- [ ] 4.2 Create `src/components/library-view/FolderSelector.tsx` — vault folder picker dropdown
- [ ] 4.3 Create `src/components/library-view/SearchBar.tsx` — search input with debounced filtering (150ms)
- [ ] 4.4 Create `src/components/library-view/DateFilter.tsx` — year range filter (from/to) below search bar
- [ ] 4.5 Create `src/components/library-view/PaperCard.tsx` — individual paper display card with:
  - Toggle checkbox (top-left)
  - Item type label
  - Bold title
  - Authors (comma-separated)
  - Year
  - Cite button (copies BibTeX to clipboard)
  - Click handler (opens PDF in Obsidian)
- [ ] 4.6 Create `src/components/library-view/AbstractTooltip.tsx` — hover tooltip showing paper abstract
- [ ] 4.7 Create `src/components/library-view/PaperList.tsx` — scrollable list of PaperCards with empty/loading/error states
- [ ] 4.8 Create `src/components/library-view/ConnectionError.tsx` — error state when Zotero is unavailable

## 5. Data Flow & State

- [ ] 5.1 Implement React Query hooks for Zotero data fetching (`useZoteroItems`, `useZoteroBibtex`)
- [ ] 5.2 Implement client-side search filtering (title + author matching)
- [ ] 5.3 Implement client-side date range filtering
- [ ] 5.4 Implement paper selection state (toggle checkboxes)
- [ ] 5.5 Wire up PDF file opening via Obsidian's `workspace.openLinkText()` or `workspace.getLeaf().openFile()`
- [ ] 5.6 Wire up BibTeX copy-to-clipboard via Zotero API + `navigator.clipboard.writeText()`

## 6. Styling

- [ ] 6.1 Add library pane CSS to `styles.css` — layout, search bar, filter area, paper cards, tooltips
- [ ] 6.2 Style paper cards to match reference images (bold title, muted authors, year, cite button)
- [ ] 6.3 Ensure dark mode compatibility using Obsidian CSS variables
- [ ] 6.4 Add hover/focus/active states for all interactive elements
- [ ] 6.5 Add smooth transitions for filter/search state changes

## 7. Edge Cases & Polish

- [ ] 7.1 Handle Zotero connection failures gracefully (error state with retry)
- [ ] 7.2 Handle empty folder selection (no PDFs found message)
- [ ] 7.3 Handle no search results ("No match" message)
- [ ] 7.4 Handle clearing search (revert to showing all PDFs)
- [ ] 7.5 Ensure filter/search resets are instant with no lag
- [ ] 7.6 Add loading skeleton/spinner during initial data fetch
- [ ] 7.7 Virtualize paper list for large libraries (100+ papers)

## 8. Testing

- [ ] 8.1 Write unit tests for Zotero client API methods
- [ ] 8.2 Write unit tests for PDF-to-Zotero matching logic
- [ ] 8.3 Write unit tests for search/filter logic
- [ ] 8.4 Write settings migration test
