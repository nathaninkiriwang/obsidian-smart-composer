# Library ↔ Chat Bidirectional Sync

Capability for synchronizing paper selection between the library pane and chat input.

## ADDED Requirements

### Requirement: Library checkbox → chat mentionable

When a paper's checkbox is toggled ON in the library pane, the paper SHALL immediately appear as a `MentionablePdf` chip in the active chat input.

#### Scenario: Select paper in library

**Given** the library pane shows 5 papers, none selected
**And** the chat input is empty
**When** the user clicks the checkbox on "Attention Is All You Need"
**Then** a `MentionablePdf` chip for that paper appears above the chat input
**And** the chip shows the paper's title

#### Scenario: Deselect paper in library

**Given** "Attention Is All You Need" is checked in the library and shows as a chip in the chat
**When** the user unchecks the paper in the library
**Then** the chip is removed from the chat input

### Requirement: Chat @mention → library checkbox

When a paper is @-mentioned in the chat, the corresponding paper's checkbox in the library pane SHALL be automatically checked.

#### Scenario: Mention paper in chat

**Given** the library pane shows "BERT" as unchecked
**When** the user types `@BERT` and selects the paper from the dropdown
**Then** the BERT paper's checkbox in the library pane becomes checked
**And** the BERT chip appears above the chat input

#### Scenario: Remove mention from chat

**Given** "BERT" was @-mentioned and is checked in the library
**When** the user deletes the @BERT mention node from the editor (or removes the chip)
**Then** the BERT paper's checkbox in the library pane becomes unchecked

### Requirement: Shared selection store

A plugin-level store SHALL maintain the set of selected papers, accessible from both the library pane and chat input React trees.

#### Scenario: Store persists across view interactions

**Given** the user selects 2 papers via library checkboxes
**When** the user switches to the chat view
**Then** the 2 selected papers appear as chips in the chat input
**And** switching back to the library shows both papers still checked

### Requirement: Selection scoped to active chat

Paper selection SHALL be scoped to the current chat conversation. Starting a new chat clears the selection.

#### Scenario: New chat clears selection

**Given** 3 papers are selected
**When** the user starts a new chat
**Then** all library checkboxes are unchecked
**And** no paper chips appear in the new chat input
