## Context

The Zotero library pane was built with browser `fetch()` for API calls, but Zotero's local server at `http://localhost:23119` returns no CORS headers. Obsidian runs in Electron's renderer process where CORS is enforced for `fetch()`. The codebase already uses `requestUrl` from Obsidian's API throughout (see `fetch-utils.ts`, `DatabaseManager.ts`, `geminiProject.ts`, etc.) which bypasses CORS.

Additionally, the current design assumed users would manually place PDFs in their vault. In reality, Zotero stores PDFs in `~/Zotero/storage/{ATTACHMENT_KEY}/{filename.pdf}` — a flat directory of random 8-character hash folders. Users need the plugin to automatically copy these into the vault organized by Zotero's collection hierarchy.

### Zotero Local API Shape (confirmed via testing)

**Collections**: `GET /api/users/0/collections?format=json`
```json
[
  {"key": "AULA7YZC", "data": {"name": "PhD", "parentCollection": false}},
  {"key": "NEAT5IJY", "data": {"name": "Forecasting", "parentCollection": "AULA7YZC"}}
]
```

**Items**: `GET /api/users/0/items?format=json`
- Each item has `data.collections: ["NEAT5IJY"]` — array of collection keys
- Attachments have `data.parentItem`, `data.filename`, `data.contentType`, `data.itemType: "attachment"`
- PDF storage path: `~/Zotero/storage/{attachment.key}/{attachment.data.filename}`

**BibTeX**: `GET /api/users/0/items/{key}?format=bibtex` — returns BibTeX string

**Key finding**: `itemType` filter `-attachment || note` is wrong; correct syntax: `-attachment || -note` (negate each type separately).

## Goals / Non-Goals

### Goals
- Fix CORS-blocked API calls so the library pane actually works
- Automatically sync PDFs from Zotero storage to `Library/` folder in vault
- Mirror Zotero's collection hierarchy as folder structure
- Watch Zotero's storage directory for new/changed files and sync incrementally
- Items in multiple collections get copied to each collection folder
- Clean up: remove orphaned PDFs from vault when removed from Zotero

### Non-Goals
- Two-way sync (vault → Zotero). This is read-only from Zotero.
- Syncing non-PDF attachments (snapshots, HTML, etc.)
- Syncing items not in any collection (they stay unorganized)
- Modifying Zotero data in any way

## Decisions

### CORS Fix
- **Decision**: Replace all `fetch()` calls in `zoteroClient.ts` with `requestUrl()` from Obsidian
- **Rationale**: This is the established pattern in the codebase. `requestUrl` uses Electron's net module which is not subject to CORS.
- **Trade-off**: `requestUrl` doesn't support streaming, but we don't need streaming for Zotero's small JSON/BibTeX responses.

### Sync Architecture
- **Decision**: New `ZoteroSync` class in `src/core/zotero/zoteroSync.ts` that:
  1. On initialization and on file-change events, fetches the full collection tree and item list from Zotero API
  2. Builds a `collectionKey → folder path` map (e.g., `AULA7YZC → "Library/PhD"`)
  3. For each non-attachment item, finds its PDF attachment and the source file path
  4. Copies PDFs to the vault using `vault.adapter.writeBinary()` — only if the file doesn't already exist or has a different size
  5. Creates collection folders with `vault.createFolder()` as needed
- **Rationale**: Simple, deterministic sync. No database needed — just compare Zotero API state to vault filesystem state.

### File Watching
- **Decision**: Use Node.js `fs.watch()` on `~/Zotero/storage/` (recursive) to detect new/changed PDFs, debounced to 5 seconds to batch rapid changes
- **Rationale**: Obsidian runs in Electron with full Node.js access. `fs.watch` is lightweight and sufficient for detecting new downloads from the Chrome extension.
- **Alternative considered**: Polling on an interval — rejected because it adds unnecessary delay and CPU usage.

### Collection Folder Structure
- **Decision**: Map collection hierarchy to `Library/{name}/{name}/...` folder paths. Sanitize names for filesystem compatibility (replace `/\:*?"<>|` with `-`).
- **Example**: Zotero collections `PhD` → `Forecasting` becomes `Library/PhD/Forecasting/`
- **Items in multiple collections**: PDF is copied to each collection folder (duplicated). This is intentional — it mirrors what the user sees in Zotero.
- **Items in no collection**: Placed in `Library/_Unsorted/` folder.

### Library Pane Changes
- **Decision**: Replace `FolderSelector` with `CollectionSelector` that shows the Zotero collection tree fetched from the API. Selecting a collection shows papers from that collection (sourced from the synced vault + Zotero metadata).
- **Rationale**: The folder selector was a workaround. Now that sync mirrors collections as folders, the selector should reflect the Zotero collection hierarchy directly.

### Reading Zotero PDFs
- **Decision**: Read PDF bytes from `~/Zotero/storage/{key}/{filename}` using Node.js `fs.readFileSync()` (or `fs.promises.readFile`), then write to vault via `vault.adapter.writeBinary()`.
- **Rationale**: The Zotero storage path is outside the vault, so `vault.adapter.readBinary()` can't reach it. Node.js `fs` is available in Electron.

## Risks / Trade-offs

- **Large libraries**: Users with thousands of papers may have a slow initial sync. Mitigation: Show progress indicator, sync incrementally (skip files that already exist with same size).
- **Disk space**: Duplicating PDFs into the vault doubles storage. Mitigation: This is intentional and expected. Users can configure the vault path or disable sync if storage is a concern.
- **Zotero storage path varies**: Default is `~/Zotero/storage` but can differ. Mitigation: Make it configurable in settings.
- **File watcher reliability**: `fs.watch` can be flaky on some platforms. Mitigation: Also provide a manual "Sync now" command as fallback.

## Open Questions

- None — all clarified via user input and API testing.
