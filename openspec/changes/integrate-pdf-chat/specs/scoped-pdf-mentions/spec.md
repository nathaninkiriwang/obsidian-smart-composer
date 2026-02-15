# Scoped PDF Mentions

Capability for scoping the @ mention file picker to show only PDF papers from the current Zotero collection.

## MODIFIED Requirements

### Requirement: @ mention search scoped to Zotero collection

When the library pane has an active collection, the @ file picker SHALL show only PDF papers from that collection (via Zotero API data), not all vault files.

#### Scenario: User types @ with a collection selected

**Given** the library pane has "Machine Learning" collection selected with 8 papers
**When** the user types `@` in the chat input
**Then** the dropdown shows up to 8 PDF papers from that collection
**And** each result displays the paper's Zotero title (not raw filename)
**And** no markdown files, folders, or vault-wide options appear

#### Scenario: User types @ with no collection selected (All Items)

**Given** the library pane shows "All Items"
**When** the user types `@` in the chat input
**Then** the dropdown shows all papers from the Zotero library
**And** results are fuzzy-filtered by the query text

#### Scenario: User types @ with search query

**Given** the collection has 20 papers
**When** the user types `@forecast` in the chat input
**Then** only papers whose title or authors match "forecast" appear in the dropdown

### Requirement: Multiple PDF mentions per message

The user SHALL be able to add multiple `@paper` mentions in a single message, each appearing as a separate chip above the input.

#### Scenario: Reference three papers in one message

**Given** the user types `Compare the methods in @PaperA, @PaperB, and @PaperC`
**When** each paper is selected from the dropdown
**Then** 3 separate `MentionablePdf` chips appear above the chat input
**And** all 3 papers' content is included in the compiled prompt

## ADDED Requirements

### Requirement: PDF-only search function

A new search function `fuzzySearchPdfs()` SHALL accept a list of `PaperMetadata` and return matches as `MentionablePdf` results.

#### Scenario: Fuzzy search within papers

**Given** papers: ["Attention Is All You Need", "BERT: Pre-training", "GPT-4 Technical Report"]
**When** query is "attention"
**Then** "Attention Is All You Need" is returned first
**And** results are `MentionablePdf` objects with title, file, and zoteroKey
