# Workspace canvas prototype

## Open it

Double-click `index.html`, or drag it into a browser. It is plain HTML, CSS and JavaScript: there is no install, server, login or build step.

For the narrow fallback, resize the browser to **375 px** wide. The free canvas becomes a document: frames stack top to bottom and blocks remain editable.

## What really works

- Type directly in a block. Type `/` to open the block menu; press Enter to create the next block. Paste a copied image while editing a block to create an image block.
- Drag blocks freely, including into and out of frames. Drag a frame by its header; its blocks move with it. Resize blocks and frames from their lower-right corner.
- Pan the empty canvas, zoom with the mouse wheel or toolbar, add/rename/delete frames, and add/delete blocks. The default **Workspace** frame can be renamed and moved but refuses deletion.
- Star a block, set or clear its phase label, switch the selected phase, and use All / General / selected phase / Starred / Client feedback filters. Filters dim instead of rearranging blocks.
- “Client answered” creates a Design 3D · D2 Client feedback block in the default Workspace frame. “Phase details” opens the Requirements, Files and round-history drawer.

## What is faked

All names, files, status and content are invented sample data. Nothing talks to StudioFlow, its database, users, permissions, files or workflow engine. “Send to client” only shows a notice. State is kept in the page memory/local browser storage only; this prototype does not define the production data model or final visual design.

## Three open questions for the owner

1. Does the Workspace feel correctly placed as the main project surface below a compact workflow bar, or should the workflow be even quieter?
2. On desktop, should frames remain free in every direction like this, or should they gently snap into alignment while dragging?
3. On a phone, is the top-to-bottom document fallback enough, or must people also be able to reposition blocks there?
