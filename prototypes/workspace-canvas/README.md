# Workspace canvas prototype

## Open it

Open `http://localhost:4173` while the `workspace-prototype` preview server runs (`.claude/launch.json`), or
double-click `index.html` in File Explorer. Do not open it from an editor's file preview: that shows the page
without its styles and script.

For the phone view, make the browser **375 px** wide: the frames read top to bottom as a document.

## What really works

- Looks like StudioFlow: UI Engine colours, type (Schibsted Grotesk, Instrument Serif), radii and shadows, light
  and dark (follows the device), the project page shell, the phase strip and the pill bars.
- Type directly in a card; `/` opens the block menu; Enter makes the next card; paste an image to drop it in.
- **Middle-click and drag** moves around the canvas from anywhere (Space + left-drag does the same on a
  trackpad). The wheel zooms. Left-drag on an empty spot does nothing.
- Cards **grow and shrink with their content**; only their width is set by hand (images keep a size). A frame
  grows to hold the cards in it.
- **Snapping**: positions and widths land on an 8 px grid, and a card or frame dragged near another edge locks
  to it (left, right, top, bottom, or stacked/beside with a 16 px gap) with a guide line.
- Frames: create, rename, move (their cards come along), resize, delete; the default **Workspace** frame
  refuses deletion. Starred, phase labels, dimming filters, phase switching, Client answered, Phase details.
- Changes stay after a reload (this browser only); **Reset** restores the sample.

## What is faked

All names, files, status and content are invented sample data. Nothing talks to StudioFlow, its database,
users, permissions, files or workflow engine. "Send to client" only shows a notice.

## Open questions for the owner

1. Is the compact workflow bar above the board quiet enough?
2. Is the snapping strength right (10 px), or should it be stronger or softer?
3. On a phone, is the top-to-bottom document enough, or must cards be movable there too?
