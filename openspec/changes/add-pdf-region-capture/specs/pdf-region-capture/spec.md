## ADDED Requirements

### Requirement: PDF Crosshair Overlay

The system SHALL display a crosshair cursor overlay on any active PDF view in the Obsidian workspace. The overlay MUST activate automatically when the mouse pointer enters the PDF content region and deactivate when the pointer leaves.

#### Scenario: Mouse enters PDF view
- **WHEN** the user moves the mouse pointer over a PDF document rendered in an Obsidian workspace leaf
- **THEN** the cursor changes to a crosshair and a subtle visual indicator (e.g., faint border highlight) appears around the PDF content area

#### Scenario: Mouse leaves PDF view
- **WHEN** the user moves the mouse pointer away from the PDF content area
- **THEN** the crosshair cursor reverts to the default cursor and the visual indicator disappears

#### Scenario: Non-PDF view active
- **WHEN** the active workspace leaf contains a non-PDF view (markdown, canvas, etc.)
- **THEN** no crosshair overlay is displayed

### Requirement: Region Selection Rectangle

The system SHALL allow users to draw a rectangular selection on the PDF content by clicking and dragging while the crosshair overlay is active. The selection rectangle MUST provide real-time visual feedback during the drag operation and MUST be constrained to a single PDF page.

#### Scenario: Click and drag to select region
- **WHEN** the user clicks and drags on a PDF page with the crosshair cursor
- **THEN** a visible selection rectangle is drawn from the click origin to the current mouse position, updating in real time

#### Scenario: Selection spans page boundary
- **WHEN** the user starts a drag on one PDF page and moves the pointer beyond that page's boundary
- **THEN** the selection rectangle is clipped to the bounds of the page where the drag started

#### Scenario: Cancel selection with Escape
- **WHEN** the user presses the Escape key during a drag operation
- **THEN** the selection rectangle is dismissed and no capture occurs

### Requirement: Region Screenshot Capture

The system SHALL capture the content within the selection rectangle as a PNG image by reading pixel data from the underlying PDF canvas element. The captured image MUST match exactly what the user sees on screen at the current zoom level and scroll position.

#### Scenario: Successful region capture
- **WHEN** the user releases the mouse button after drawing a selection rectangle
- **THEN** the system reads pixel data from the PDF page canvas within the selected bounds, composites it into a new image, and produces a base64-encoded PNG data URL

#### Scenario: Minimum selection size
- **WHEN** the user releases the mouse button after a drag smaller than 10x10 pixels
- **THEN** the system treats this as a click (not a selection) and no capture occurs

### Requirement: Captured Image to Chat

The system SHALL insert the captured PNG image into the Smart Composer chat input as a `MentionableImage`. If the chat pane is not visible, the system SHALL open it before inserting the image. The system MUST NOT auto-send the message — the user types their prompt and sends manually.

#### Scenario: Chat pane open
- **WHEN** a region capture completes and the Smart Composer chat pane is already visible
- **THEN** the captured image is added as a `MentionableImage` badge in the chat input area

#### Scenario: Chat pane closed
- **WHEN** a region capture completes and the Smart Composer chat pane is not visible
- **THEN** the system opens the Smart Composer chat pane and then adds the captured image as a `MentionableImage` badge in the chat input area

#### Scenario: Multiple captures
- **WHEN** the user captures multiple regions before sending a message
- **THEN** each captured image is appended as an additional `MentionableImage` to the chat input, preserving previously captured images

### Requirement: Overlay Lifecycle Management

The system SHALL manage the crosshair overlay lifecycle in response to workspace changes. Overlays MUST be created when PDF views appear and destroyed when PDF views close or the plugin unloads.

#### Scenario: PDF view opened
- **WHEN** a user opens a PDF file in Obsidian
- **THEN** the crosshair overlay is mounted on the PDF content container

#### Scenario: PDF view closed
- **WHEN** a user closes a workspace leaf containing a PDF view
- **THEN** the crosshair overlay for that leaf is destroyed and all event listeners are removed

#### Scenario: Plugin unload
- **WHEN** the Smart Composer plugin is disabled or Obsidian shuts down
- **THEN** all crosshair overlays are destroyed and all associated event listeners and observers are cleaned up
