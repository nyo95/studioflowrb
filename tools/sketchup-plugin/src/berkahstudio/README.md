# Berkah Studio 1.2.1

Install `BerkahStudio_1.2.1.rbz` through SketchUp > Extension Manager > Install Extension, then restart SketchUp.

The installed package uses one loader, `berkahstudio.rb`, and one folder, `berkahstudio/`.

## Connect to StudioFlow

1. In StudioFlow, the Developer switches on the SketchUp module; on Account > Integration tokens create a token with
   "SketchUp: read project schedules" and "SketchUp: add schedule items". The secret (`sfk_...`) is shown once.
2. In SketchUp: Extensions > Berkah Studio > Sambung ke StudioFlow... Enter the server address (local: http://localhost:3001)
   and the token, then pick the project. The address must be https://; http:// is accepted only for this computer
   (localhost) and the office network (for example 192.168.x.x, after a warning), because the token travels with
   every request. The token is stored in SketchUp's preferences; the project is stored in the model.

## Codes from the schedule (Auto-Rename Material)

Click Auto-Rename, then a painted surface. The plugin always asks before it changes anything:

- Material already linked: shows its item (for example "SO-01 · Corian Glacier White") and offers another item.
- Name reads as a code the schedule has (SO-1, SO-001 and so-01 are all SO-01): "Ini SO-01 · ...?" Yes links it and
  renames it SO-01.
- Otherwise: choose a category, then an item (similar names first) or "Item baru"; StudioFlow gives the new code.
- Material linked to an item that was deleted from the schedule: the plugin says so ("dulu ST-01 · ...") and starts
  at "leave it". A code can be given to a new item later, so the new ST-01 is named and linked only on request.
- Material linked to another StudioFlow project: said so; it is linked to this project only through the questions.
- "Item baru" survives a lost connection: click the same material again and the plugin finishes the same request,
  so StudioFlow does not make a second item.
- Merging two materials is off until materials are linked to schedule options (WO-SKETCHUP-03); a code or a name
  alone never decides that two materials are the same.

Not connected: the old category picker codes the material offline (PL-01 style), marked as not linked.

## Refresh codes

Extensions > Berkah Studio > Perbarui kode dari jadwal renames linked materials to their current schedule code (for
example after an item moved category), in one undo step. A name wanted by two materials, or used by another material, is given to nobody and listed. A
material whose item was removed keeps its name and its old link and is listed, so you decide what it becomes.

Component Tracker and Wall Finish Labels remain under Extensions > Berkah Studio and do not use the schedule.
