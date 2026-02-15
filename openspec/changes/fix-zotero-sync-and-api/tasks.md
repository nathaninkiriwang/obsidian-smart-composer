## 1. Fix Zotero API Connection (CORS)

- [ ] 1.1 Replace all `fetch()` calls in `src/core/zotero/zoteroClient.ts` with `requestUrl()` from Obsidian
- [ ] 1.2 Fix `itemType` filter from `-attachment || note` to `-attachment || -note`
- [ ] 1.3 Verify API calls work from within Obsidian (test connection, fetch items, fetch BibTeX)

## 2. Zotero Types and Collection Support

- [ ] 2.1 Add `ZoteroCollection` type to `src/types/zotero.types.ts`
- [ ] 2.2 Add `fetchCollections()` method to `ZoteroClient`
- [ ] 2.3 Add `fetchCollectionItems(collectionKey)` method to `ZoteroClient`
- [ ] 2.4 Add collection tree building utility (parent-child hierarchy from flat list)

## 3. Settings Update

- [ ] 3.1 Update `src/settings/schema/setting.types.ts`: replace `selectedFolder` with `zoteroStoragePath` (default: `~/Zotero/storage`) and `libraryVaultPath` (default: `Library`)
- [ ] 3.2 Update migration `16_to_17.ts` to reflect new settings shape
- [ ] 3.3 Update `src/settings/schema/settings.test.ts` for new default values

## 4. Sync Engine

- [ ] 4.1 Create `src/core/zotero/zoteroSync.ts` with `ZoteroSync` class
- [ ] 4.2 Implement `buildCollectionTree()` — fetch collections, build key-to-path map
- [ ] 4.3 Implement `syncPdfs()` — for each item, find PDF attachment, resolve source path in Zotero storage, copy to vault under collection folder structure
- [ ] 4.4 Implement incremental sync — skip files that already exist with matching size
- [ ] 4.5 Implement folder creation — create `Library/{collection path}` directories as needed
- [ ] 4.6 Handle items in multiple collections (copy to each)
- [ ] 4.7 Handle items in no collection (copy to `Library/_Unsorted/`)
- [ ] 4.8 Implement file watcher on Zotero storage directory using `fs.watch()` with 5s debounce
- [ ] 4.9 Add `cleanup()` method to close file watcher on plugin unload

## 5. Plugin Integration

- [ ] 5.1 Initialize `ZoteroSync` in `src/main.ts` on plugin load
- [ ] 5.2 Add "Sync Zotero library" command to command palette
- [ ] 5.3 Wire up file watcher to trigger incremental sync
- [ ] 5.4 Add cleanup in `onunload()` for sync engine

## 6. Library Pane UI Updates

- [ ] 6.1 Replace `FolderSelector.tsx` with `CollectionSelector.tsx` — dropdown showing Zotero collection tree
- [ ] 6.2 Update `LibraryPane.tsx` to source papers from selected collection via Zotero API + synced vault paths
- [ ] 6.3 Add "Sync now" button in library pane header
- [ ] 6.4 Add sync status indicator (last synced time, syncing spinner)
- [ ] 6.5 Show collection item count next to each collection name

## 7. Testing and Validation

- [ ] 7.1 Test API connection works from within Obsidian (no CORS errors)
- [ ] 7.2 Test PDF sync creates correct folder structure mirroring collections
- [ ] 7.3 Test incremental sync skips already-synced files
- [ ] 7.4 Test file watcher triggers sync on new Zotero downloads
- [ ] 7.5 Test library pane displays papers from synced collection
- [ ] 7.6 Test BibTeX citation copy works
- [ ] 7.7 Update settings migration test
