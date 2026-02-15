## ADDED Requirements

### Requirement: Library View Registration
The system SHALL register a new `smtcmp-library-view` view type that appears in Obsidian's left sidebar panel (alongside Files, Search, Bookmarks). The view SHALL be openable via a ribbon icon and a command palette command.

#### Scenario: User opens library pane via ribbon icon
- **WHEN** user clicks the library ribbon icon in the left sidebar
- **THEN** the library pane opens in the left sidebar
- **AND** the pane displays the folder selector, search bar, and paper list

#### Scenario: User opens library pane via command palette
- **WHEN** user executes the "Open library" command from the command palette
- **THEN** the library pane opens in the left sidebar

#### Scenario: Library pane persists across sessions
- **WHEN** the library pane is open and user restarts Obsidian
- **THEN** the library pane restores in the left sidebar on reload

### Requirement: Folder Selection
The system SHALL provide a folder selector dropdown that lists all folders in the Obsidian vault. When a folder is selected, the system SHALL scan it for `.pdf` files and display them in the paper list. The selected folder SHALL persist across sessions via plugin settings.

#### Scenario: User selects a folder with PDFs
- **WHEN** user selects a folder from the folder selector dropdown
- **THEN** the system scans the folder for `.pdf` files
- **AND** for each PDF, the system attempts to fetch metadata from Zotero's local API
- **AND** papers with metadata are displayed as enriched paper cards
- **AND** papers without Zotero metadata are displayed with filename as title

#### Scenario: User selects a folder with no PDFs
- **WHEN** user selects a folder containing no `.pdf` files
- **THEN** the system displays an empty state message: "No PDF files found in this folder"

#### Scenario: Selected folder persists across sessions
- **WHEN** user selects a folder and later restarts Obsidian
- **THEN** the previously selected folder is automatically loaded on pane open

### Requirement: Zotero API Integration
The system SHALL communicate with Zotero's local API at `http://localhost:23119/api` (configurable base URL) to fetch paper metadata. The system SHALL use the `GET /api/users/0/items` endpoint with `format=json` to retrieve item data and `format=bibtex` to export citations. The system SHALL match vault PDF files to Zotero items by attachment filename with fuzzy title fallback.

#### Scenario: Zotero is running and accessible
- **WHEN** the library pane loads and Zotero is running with local API enabled
- **THEN** the system successfully fetches metadata for papers in the selected folder
- **AND** each paper card displays title, authors, year, and item type from Zotero

#### Scenario: Zotero is not running or API is disabled
- **WHEN** the library pane attempts to connect to Zotero and the connection fails
- **THEN** the system displays an error message: "Cannot connect to Zotero. Ensure Zotero is running and local API access is enabled."
- **AND** a "Retry" button is provided to re-attempt the connection

#### Scenario: PDF has no matching Zotero item
- **WHEN** a PDF file cannot be matched to any Zotero item
- **THEN** the paper card displays the PDF filename as the title
- **AND** authors, year, and abstract fields are omitted
- **AND** the Cite button is disabled for that paper

### Requirement: Search Functionality
The system SHALL provide a search bar at the top of the library pane. Searching SHALL filter the displayed papers by matching against title and/or author fields from Zotero metadata. Search SHALL be debounced (150ms) and filter results client-side from cached data for instant responsiveness. When the search input is cleared, ALL papers SHALL be displayed again. When no papers match the search query, the system SHALL display "No match".

#### Scenario: User searches by title
- **WHEN** user types a paper title (or partial title) in the search bar
- **THEN** the paper list filters to show only papers whose title contains the search term (case-insensitive)
- **AND** filtering occurs within 150ms of the last keystroke

#### Scenario: User searches by author
- **WHEN** user types an author name in the search bar
- **THEN** the paper list filters to show only papers with a matching author (case-insensitive)

#### Scenario: User searches by title and author combined
- **WHEN** user types a query matching both title and author fields
- **THEN** papers matching on either title OR author are displayed

#### Scenario: User clears search input
- **WHEN** user deletes all text from the search bar
- **THEN** all papers in the selected folder are displayed immediately

#### Scenario: No results match the search
- **WHEN** user enters a search term that matches no papers
- **THEN** the system displays "No match" in place of the paper list

### Requirement: Date Filter
The system SHALL provide a date filter option below the search bar. The filter SHALL allow users to specify a year range (from year, to year) to narrow displayed papers. The filter SHALL be applied client-side on cached data for instant response. When the filter is cleared, all papers SHALL be displayed.

#### Scenario: User filters by date range
- **WHEN** user sets a "from" year of 2020 and a "to" year of 2024
- **THEN** only papers published between 2020 and 2024 (inclusive) are displayed
- **AND** filtering is applied instantly without network requests

#### Scenario: User sets only a "from" year
- **WHEN** user sets a "from" year of 2022 and leaves "to" empty
- **THEN** only papers from 2022 onwards are displayed

#### Scenario: User clears the date filter
- **WHEN** user clears both year inputs
- **THEN** all papers are displayed (subject to any active search query)

#### Scenario: Date filter combined with search
- **WHEN** user has both a search query and a date filter active
- **THEN** only papers matching both the search query AND the date range are displayed

### Requirement: Paper Card Display
Each paper in the list SHALL be displayed as a card with the following layout:
- **Top-left**: Toggle checkbox for selection
- **Top**: Item type label (e.g., "Article", "Conference Paper")
- **Title**: Bold, full paper title
- **Authors**: Comma-separated author last names, muted color
- **Year**: Publication year, muted color
- **Cite button**: Styled button that fetches and copies the BibTeX citation to the clipboard

#### Scenario: Paper card displays complete metadata
- **WHEN** a paper has full Zotero metadata (title, authors, year, item type)
- **THEN** the card displays all fields in the specified layout
- **AND** the title is bold
- **AND** authors are comma-separated last names in muted text
- **AND** the year is displayed below authors in muted text

#### Scenario: User clicks the Cite button
- **WHEN** user clicks the "Cite" button on a paper card
- **THEN** the system fetches the BibTeX citation from Zotero API (`format=bibtex`)
- **AND** the BibTeX text is copied to the user's clipboard
- **AND** a confirmation notice is shown ("Citation copied to clipboard")

#### Scenario: Cite button for paper without Zotero metadata
- **WHEN** a paper has no matching Zotero item
- **THEN** the Cite button is visually disabled
- **AND** clicking it has no effect

### Requirement: Abstract Tooltip on Hover
The system SHALL display the paper's abstract in a tooltip/popover when the user hovers over a paper card. The tooltip SHALL appear after a brief delay (300ms) and disappear when the cursor leaves the card. If the paper has no abstract, no tooltip SHALL appear.

#### Scenario: User hovers over a paper with an abstract
- **WHEN** user hovers over a paper card for 300ms or more
- **THEN** a tooltip appears showing the paper's abstract text
- **AND** the tooltip is positioned near the card without obscuring it

#### Scenario: User hovers over a paper without an abstract
- **WHEN** user hovers over a paper card that has no abstract in Zotero
- **THEN** no tooltip appears

#### Scenario: User moves cursor away from paper
- **WHEN** user moves the cursor off the paper card
- **THEN** the abstract tooltip disappears

### Requirement: PDF Opening
The system SHALL open the corresponding PDF file in Obsidian's built-in PDF viewer when a user clicks on a paper card (outside of the checkbox and Cite button). The PDF SHALL open in the main editor area.

#### Scenario: User clicks a paper card
- **WHEN** user clicks on the body of a paper card (not the checkbox or Cite button)
- **THEN** the corresponding PDF file opens in Obsidian's main editor pane

#### Scenario: PDF file no longer exists
- **WHEN** user clicks a paper card whose PDF file has been deleted from the vault
- **THEN** the system displays an error notice: "PDF file not found"

### Requirement: Paper Selection Toggle
Each paper card SHALL have a toggle checkbox in the top-left corner. Toggling the checkbox SHALL select/deselect the paper. Selected papers SHALL be visually distinguished (e.g., highlighted border or background). The selection state is maintained in component state for future functionality.

#### Scenario: User toggles a paper's checkbox
- **WHEN** user clicks the checkbox on a paper card
- **THEN** the paper is marked as selected
- **AND** the card displays a visual selection indicator (highlighted border/background)

#### Scenario: User deselects a paper
- **WHEN** user clicks the checkbox on an already-selected paper card
- **THEN** the paper is deselected
- **AND** the visual selection indicator is removed

#### Scenario: Selection persists during search/filter changes
- **WHEN** user has selected papers and then applies a search or filter
- **THEN** selected papers that still match the filter retain their selection state
- **AND** when the filter is cleared, previously selected papers are still selected

### Requirement: Zotero Settings Configuration
The system SHALL add a Zotero configuration section to the plugin settings with a configurable API base URL (default: `http://localhost:23119`). A "Test Connection" button SHALL verify connectivity to the Zotero API.

#### Scenario: User changes Zotero API base URL
- **WHEN** user changes the Zotero API base URL in settings
- **THEN** all subsequent Zotero API calls use the new base URL

#### Scenario: User tests Zotero connection
- **WHEN** user clicks the "Test Connection" button in settings
- **AND** Zotero is running and accessible
- **THEN** a success message is displayed

#### Scenario: Connection test fails
- **WHEN** user clicks the "Test Connection" button
- **AND** Zotero is not accessible
- **THEN** an error message is displayed with troubleshooting guidance

### Requirement: Performance and Responsiveness
The system SHALL ensure all user interactions (search, filter, toggle, scroll) are responsive with no perceptible lag. Search input SHALL be debounced at 150ms. Filtering and selection SHALL operate on client-side cached data. The paper list SHALL support virtualized rendering for libraries with 100+ papers.

#### Scenario: Rapid search input
- **WHEN** user types quickly in the search bar
- **THEN** the paper list updates within 150ms of the last keystroke
- **AND** no intermediate flickering or lag occurs

#### Scenario: Large library scrolling
- **WHEN** the selected folder contains 100+ PDFs with Zotero metadata
- **THEN** the paper list scrolls smoothly without frame drops
- **AND** paper cards render on-demand via list virtualization
