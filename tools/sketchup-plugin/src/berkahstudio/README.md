# Berkah Studio 1.2.0

Install `BerkahStudio_1.2.0.rbz` through SketchUp > Extension Manager > Install Extension, then restart SketchUp.

The installed package uses one loader, `berkahstudio.rb`, and one folder, `berkahstudio/`.

## Connect to StudioFlow

1. In StudioFlow, the Developer switches on the SketchUp module; on Account > Integration tokens create a token with
   "SketchUp: read project schedules" and "SketchUp: add schedule items". The secret (`sfk_...`) is shown once.
2. In SketchUp: Extensions > Berkah Studio > Sambung ke StudioFlow... Enter the server address (local: http://localhost:3001)
   and the token, then pick the project. The token is stored in SketchUp's preferences; the project is stored in the model.

## Codes from the schedule (Auto-Rename Material)

Click Auto-Rename, then a painted surface. The plugin always asks before it changes anything:

- Material already linked: shows its item (for example "SO-01 · Corian Glacier White") and offers another item.
- Name reads as a code the schedule has (SO-1, SO-001 and so-01 are all SO-01): "Ini SO-01 · ...?" Yes links it and
  renames it SO-01.
- Otherwise: choose a category, then an item (similar names first) or "Item baru"; StudioFlow gives the new code.
- When another material in the model belongs to the same item, the plugin offers to merge them into one material,
  showing how many surfaces each paints and warning when their look differs. One undo restores them. The schedule is
  never changed by a merge.

Not connected: the old category picker codes the material offline (PL-01 style), marked as not linked.

## Refresh codes

Extensions > Berkah Studio > Perbarui kode dari jadwal renames linked materials to their current schedule code (for
example after an item moved category), in one undo step. A material whose item was removed is unlinked.

Component Tracker and Wall Finish Labels remain under Extensions > Berkah Studio and do not use the schedule.
