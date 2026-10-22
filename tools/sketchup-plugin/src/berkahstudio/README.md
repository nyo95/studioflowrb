# Berkah Studio 1.3.0

Install `BerkahStudio_1.3.0.rbz` through SketchUp > Extension Manager > Install Extension, then restart SketchUp.

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
- Otherwise: choose a category, then an item (similar names first) or "Item baru"; StudioFlow gives the new code. A new
  item has no option; options (alternatives) are made in the Product Schedule or through the AI assistant (MCP).
- An item with several options asks which option this material shows (the final one is marked); one option is taken.
- Names: `PL-02` for the final option, the only option, or an item without options; `PL-02-B` for an alternative that
  is not final. A material never takes a name another material holds; a stale material holding the code may be
  renamed to `PL-02 lama` if you say so.
- A linked material shows its item, option and status (final, not final with the final option, option not chosen) and
  offers: keep, rename to the expected name, choose another option, or another item.
- Material linked to an item that was deleted from the schedule: the plugin says so ("dulu ST-01 · ...") and starts
  at "leave it". A code can be given to a new item later, so the new ST-01 is named and linked only on request.
- Material linked to another StudioFlow project: said so; it is linked to this project only through the questions.
- "Item baru" survives a lost connection: click the same material again and the plugin finishes the same request,
  so StudioFlow does not make a second item.
- Merge: offered only for materials linked to the same item and the same option (never by name or code). Same look:
  one question, every surface keeps its look (texture position carried over). Different look: "Jangan gabung" first;
  to go on you pick the look that stays. One undo; the schedule is never changed.

Not connected: the old category picker codes the material offline (PL-01 style), marked as not linked.

## Check and refresh codes

Extensions > Berkah Studio > Cek & perbarui kode dari jadwal reads the schedule once and checks every linked material
(no scan of the geometry): new names (for example after an item moved category, or after the final option changed:
B becomes `PL-02`, A becomes `PL-02-A`), materials on a non-final option, materials whose option is not chosen yet,
options or items that were deleted, and name conflicts. Names change only after your Yes, in one undo step. A name
wanted by two materials, or used by another material, is given to nobody and listed. A material whose item was
removed keeps its name and its old link and is listed, so you decide what it becomes.

Component Tracker and Wall Finish Labels remain under Extensions > Berkah Studio and do not use the schedule;
Component Tracker counts `PL-02-B` as a valid code.
