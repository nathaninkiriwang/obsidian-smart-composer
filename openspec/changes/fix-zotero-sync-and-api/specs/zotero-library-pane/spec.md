## MODIFIED Requirements

### Requirement: Zotero API Integration
The system SHALL communicate with Zotero's local API at `http://localhost:23119/api` (configurable base URL) using Obsidian's `requestUrl()` function to bypass CORS restrictions. The system SHALL use the `GET /api/users/0/items` endpoint with `format=json` and `itemType=-attachment || -note` to retrieve item data, `GET /api/users/0/collections` to retrieve collection hierarchy, and `format=bibtex` to export citations.

#### Scenario: Zotero is running and accessible
- **WHEN** the library pane loads and Zotero is running with local API enabled
- **THEN** the system successfully fetches metadata for papers using `requestUrl()` from Obsidian
- **AND** each paper card displays title, authors, year, and item type from Zotero

#### Scenario: Zotero is not running or API is disabled
- **WHEN** the library pane attempts to connect to Zotero and the connection fails
- **THEN** the system displays an error message: "Cannot connect to Zotero. Ensure Zotero is running and local API access is enabled."
- **AND** a "Retry" button is provided to re-attempt the connection

#### Scenario: API calls bypass CORS
- **WHEN** the system makes HTTP requests to Zotero's local API
- **THEN** all requests use Obsidian's `requestUrl()` instead of browser `fetch()`
- **AND** requests succeed regardless of CORS headers from the Zotero server

### Requirement: Folder Selection
The system SHALL provide a collection selector dropdown that lists all Zotero collections in their hierarchical structure (fetched from `/api/users/0/collections`). When a collection is selected, the system SHALL display papers belonging to that collection. The selected collection SHALL persist across sessions via plugin settings. An "All Papers" option SHALL show all synced papers regardless of collection.

#### Scenario: User selects a collection
- **WHEN** user selects a Zotero collection from the collection selector
- **THEN** the system displays papers belonging to that collection
- **AND** papers are sourced from the synced vault folder corresponding to that collection

#### Scenario: Collections are displayed hierarchically
- **WHEN** the collection selector is opened
- **THEN** sub-collections are indented under their parent collections
- **AND** each collection shows its item count

#### Scenario: User selects "All Papers"
- **WHEN** user selects the "All Papers" option
- **THEN** all synced papers across all collections are displayed

#### Scenario: Selected collection persists across sessions
- **WHEN** user selects a collection and later restarts Obsidian
- **THEN** the previously selected collection is automatically loaded on pane open

## ADDED Requirements

### Requirement: Zotero PDF Sync
The system SHALL automatically synchronize PDF files from Zotero's local storage directory (default: `~/Zotero/storage/`) into the Obsidian vault under a configurable root folder (default: `Library/`). The folder structure in the vault SHALL mirror Zotero's collection hierarchy. For each Zotero item with a PDF attachment, the system SHALL copy the PDF from `~/Zotero/storage/{attachmentKey}/{filename}` to `Library/{collection path}/{filename}`.

#### Scenario: Initial sync creates collection folders and copies PDFs
- **WHEN** the sync engine runs for the first time
- **THEN** it fetches all collections from the Zotero API
- **AND** creates a folder hierarchy under `Library/` matching the collection tree (e.g., `Library/PhD/Forecasting/`)
- **AND** for each item with a PDF attachment, copies the PDF into the corresponding collection folder

#### Scenario: Item belongs to multiple collections
- **WHEN** a Zotero item is in multiple collections
- **THEN** the PDF is copied to each corresponding collection folder in the vault

#### Scenario: Item belongs to no collection
- **WHEN** a Zotero item has a PDF attachment but is not in any collection
- **THEN** the PDF is copied to `Library/_Unsorted/`

#### Scenario: Incremental sync skips existing files
- **WHEN** the sync engine runs and a PDF already exists in the vault with the same file size
- **THEN** the file is not re-copied
- **AND** sync completes faster

#### Scenario: Folder names are sanitized
- **WHEN** a Zotero collection name contains filesystem-invalid characters (e.g., `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
- **THEN** those characters are replaced with `-` in the folder name

### Requirement: Zotero Storage File Watcher
The system SHALL monitor the Zotero storage directory for new or changed files. When a change is detected, the system SHALL trigger an incremental sync after a 5-second debounce period. The watcher SHALL be stopped on plugin unload.

#### Scenario: New PDF downloaded via Zotero Chrome extension
- **WHEN** a new PDF appears in `~/Zotero/storage/` (e.g., from a browser download)
- **THEN** the file watcher detects the change
- **AND** after a 5-second debounce, triggers an incremental sync
- **AND** the new PDF appears in the correct collection folder in the vault

#### Scenario: Multiple rapid changes are batched
- **WHEN** several files are added to Zotero storage in quick succession
- **THEN** only one sync operation runs after the 5-second debounce window

#### Scenario: Plugin unload stops watcher
- **WHEN** the plugin is unloaded or Obsidian closes
- **THEN** the file watcher is properly closed and no further sync operations are triggered

### Requirement: Manual Sync Command
The system SHALL provide a "Sync Zotero library" command in the command palette and a "Sync now" button in the library pane header. Triggering either SHALL run a full sync operation with a progress indicator.

#### Scenario: User triggers manual sync via command palette
- **WHEN** user executes the "Sync Zotero library" command
- **THEN** a full sync runs, showing a progress notice
- **AND** on completion, a success notice is shown

#### Scenario: User triggers sync via library pane button
- **WHEN** user clicks the "Sync now" button in the library pane header
- **THEN** a sync runs with a spinner indicator in the pane
- **AND** the paper list refreshes after sync completes

### Requirement: Zotero Settings Configuration
The system SHALL add a Zotero configuration section to the plugin settings with: a configurable API base URL (default: `http://localhost:23119`), a Zotero storage path (default: `~/Zotero/storage`), and a vault library path (default: `Library`). A "Test Connection" button SHALL verify connectivity to the Zotero API.

#### Scenario: User changes Zotero storage path
- **WHEN** user changes the Zotero storage path in settings
- **THEN** the file watcher is restarted on the new path
- **AND** subsequent syncs read PDFs from the new location

#### Scenario: User changes vault library path
- **WHEN** user changes the vault library path in settings
- **THEN** subsequent syncs write PDFs to the new vault folder

#### Scenario: User tests Zotero connection
- **WHEN** user clicks the "Test Connection" button in settings
- **AND** Zotero is running and accessible
- **THEN** a success message is displayed

#### Scenario: Connection test fails
- **WHEN** user clicks the "Test Connection" button
- **AND** Zotero is not accessible
- **THEN** an error message is displayed with troubleshooting guidance
