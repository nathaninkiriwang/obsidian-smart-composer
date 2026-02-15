# Change: Add Zotero Library Pane

## Why

Researchers using Obsidian with Zotero need a way to browse, search, and cite their PDF papers directly from within the editor. Currently there is no integration between Smart Composer and Zotero. Adding a left-sidebar pane that connects to Zotero's local API provides a seamless academic workflow: browse papers, search by title/author, filter by date, view abstracts on hover, open PDFs in Obsidian, copy BibTeX citations, and select papers for future AI-assisted workflows.

## What Changes

- **New view type**: `smtcmp-library-view` registered as a left-sidebar pane (alongside Files, Search, Bookmarks)
- **New React component tree**: `LibraryView.tsx` with folder selector, search bar, date filter, and paper card list
- **New Zotero integration layer**: `src/core/zotero/` module to communicate with `http://localhost:23119/api` for metadata, search, and BibTeX export
- **New constants**: `LIBRARY_VIEW_TYPE` added to `src/constants.ts`
- **Plugin registration**: New view, ribbon icon, and command registered in `src/main.ts`
- **Settings extension**: Optional Zotero API base URL configuration in settings (defaulting to `http://localhost:23119`)
- **New CSS**: Styles for the library pane, paper cards, search bar, filters, tooltips, and toggle selections

## Impact

- Affected specs: New capability `zotero-library-pane`
- Affected code:
  - `src/main.ts` — register new view, ribbon icon, command
  - `src/constants.ts` — add `LIBRARY_VIEW_TYPE`
  - `src/LibraryView.tsx` — new file (view wrapper, follows ChatView.tsx pattern)
  - `src/components/library-view/` — new directory with all React components
  - `src/core/zotero/` — new directory with Zotero API client
  - `src/types/zotero.types.ts` — new file for Zotero data types
  - `src/settings/schema/setting.types.ts` — add zotero config fields
  - `src/settings/schema/migrations/` — new migration for zotero settings
  - `styles.css` — library pane styles
