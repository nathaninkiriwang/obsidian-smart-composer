## ADDED Requirements

### Requirement: Vault-based paper listing
The library pane SHALL display all PDF files found in the vault's Library folder and its subfolders. The vault directory structure SHALL be the primary data source, not the Zotero API.

#### Scenario: Papers shown from vault directory
- **WHEN** the Library pane opens
- **THEN** all PDFs under the configured library vault path are listed
- **AND** papers are grouped by their parent folder (treated as collections)

#### Scenario: Zotero metadata enrichment
- **WHEN** Zotero is running and reachable
- **THEN** papers are enriched with structured metadata (title, authors, year, abstract, item type) from the Zotero API
- **AND** matching is performed by PDF filename

#### Scenario: Zotero unavailable fallback
- **WHEN** Zotero is not running
- **THEN** papers still appear using metadata parsed from the filename pattern `Author et al. - Year - Title.pdf`
- **AND** papers with unparseable filenames display the raw filename as the title

### Requirement: Reactive live updates
The library pane SHALL update its paper list and collection tree in real time when files are added, removed, or renamed in the vault's Library folder, without any manual refresh action.

#### Scenario: PDF added to vault
- **WHEN** a new PDF appears in the Library folder (via sync or manual copy)
- **THEN** the paper list updates within 500ms to include the new paper

#### Scenario: PDF removed from vault
- **WHEN** a PDF is deleted from the Library folder
- **THEN** the paper list updates to remove it without user intervention

#### Scenario: Folder structure changes
- **WHEN** a subfolder is created or deleted under the Library path
- **THEN** the collection selector updates to reflect the new folder structure

### Requirement: Collection tree from vault folders
The collection selector SHALL derive its tree from the vault's Library subfolder structure, not from the Zotero API.

#### Scenario: Folders shown as collections
- **WHEN** the collection dropdown is opened
- **THEN** each subfolder under `Library/` appears as a selectable collection
- **AND** nested folders appear with indentation

### Requirement: Abstract tooltip positioning
The abstract tooltip SHALL appear at the top-right of the hovered paper card, positioned so it does not overlap other cards.

#### Scenario: Tooltip appears on hover
- **WHEN** the user hovers over a paper card for 300ms
- **THEN** a tooltip appears at the top-right of the card
- **AND** the abstract is truncated to 4 lines with ellipsis
- **AND** the tooltip has a compact size (max-width ~280px)

### Requirement: Square checkbox
The paper selection checkbox SHALL be a proper square with minimal border-radius.

#### Scenario: Checkbox rendering
- **WHEN** a paper card is displayed
- **THEN** the checkbox appears as a 16x16 square with border-radius no greater than 2px

## REMOVED Requirements

### Requirement: Cite button
**Reason:** User requested removal of cite functionality.
**Migration:** Remove Cite button, BibTeX fetch, clipboard logic, and all associated CSS from PaperCard.

### Requirement: Manual sync button
**Reason:** Background sync runs continuously; manual trigger is redundant.
**Migration:** Remove sync button from library header and all associated state/CSS.
