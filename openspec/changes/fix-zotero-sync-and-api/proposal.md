# Change: Fix Zotero API connection and add collection-based PDF sync

## Why

Two critical issues with the current Zotero library pane:

1. **API connection fails in Obsidian**: The Zotero client uses browser `fetch()` which is blocked by CORS — Zotero's local API returns no CORS headers. The rest of the codebase uses Obsidian's `requestUrl()` which bypasses CORS. This makes the entire library pane non-functional.

2. **No PDF availability in vault**: The current design requires users to manually place PDFs in their vault and then tries to match them to Zotero items by filename. In practice, Zotero stores PDFs in `~/Zotero/storage/{KEY}/filename.pdf` — a flat, messy directory of 8-char hash folders. Users need an automatic sync that copies PDFs into the vault organized by Zotero's collection hierarchy.

Additionally, the `itemType` filter syntax is wrong (`-attachment || note` should be `-attachment || -note`), causing attachments to leak into item listings.

## What Changes

### Bug Fixes
- **Replace `fetch()` with `requestUrl()` from Obsidian** in `src/core/zotero/zoteroClient.ts` to bypass CORS
- **Fix `itemType` filter** syntax from `-attachment || note` to `-attachment || -note`

### New: Collection-based PDF Sync
- **Sync engine**: New `src/core/zotero/zoteroSync.ts` that watches for changes in Zotero's storage directory and syncs PDFs into the vault under `Library/` mirroring Zotero's collection tree
- **Collection tree**: Fetch collections from `/api/users/0/collections`, build parent-child hierarchy, create matching folder structure in vault (`Library/{Collection}/{Subcollection}/`)
- **PDF copying**: For each item in a collection, find its PDF attachment, copy from `~/Zotero/storage/{attachmentKey}/{filename}` to `Library/{collection path}/{filename}`
- **File watcher**: Monitor `~/Zotero/storage/` for new/changed files and trigger incremental sync
- **Library pane update**: Replace the manual folder selector with an automatic collection-based browser sourced directly from Zotero collections API

### Settings Changes
- Add `zoteroStoragePath` setting (default: `~/Zotero/storage`) for the Zotero storage directory
- Add `libraryVaultPath` setting (default: `Library`) for the vault destination folder
- Remove `selectedFolder` setting (replaced by collection-based browsing)

## Impact

- Affected specs: `zotero-library-pane` (modify existing)
- Affected code:
  - `src/core/zotero/zoteroClient.ts` — fix `fetch()` → `requestUrl()`, fix itemType filter
  - `src/core/zotero/zoteroSync.ts` — new file: sync engine with file watcher
  - `src/types/zotero.types.ts` — add `ZoteroCollection` type
  - `src/components/library-view/LibraryPane.tsx` — replace folder selector with collection browser, source data from synced vault + Zotero API
  - `src/components/library-view/FolderSelector.tsx` — replace with `CollectionSelector.tsx`
  - `src/settings/schema/setting.types.ts` — update zotero settings schema
  - `src/settings/schema/migrations/16_to_17.ts` — update migration for new fields
  - `src/main.ts` — initialize sync engine, register sync command
  - `src/LibraryView.tsx` — pass sync engine reference
