# Turning modules on and off

Use this runbook to switch an optional module (for example Ideas Board or
Presentation) on or off on a StudioFlow server, without an AI assistant.
Switching a module off hides it from everyone; **its data is kept** and comes
back exactly as it was when the module is switched on again.

Core modules (StudioFlow, Master Data, BQ) cannot be switched off.

Only someone who can open a terminal on the server can do this. No account in
the app, including the Company Administrator, can switch modules; the app shows
the current state read-only under Settings > Modules.

## Steps

1. Open PowerShell on the server and go to the StudioFlow folder.
2. Tell the command which configuration to use (`kantor` at the office,
   `rumah` at home):

   ```powershell
   $env:STUDIOFLOW_LOCATION = "kantor"
   ```

3. See every module and whether it is on:

   ```powershell
   npm run studioflow -- module list
   ```

   The table shows each module's `id`, version, `core` or `optional`, and
   `ENABLED` or `DISABLED`.

4. Switch a module off or on using its `id` from that table:

   ```powershell
   npm run studioflow -- module disable ideas
   npm run studioflow -- module enable ideas
   ```

   The command answers with the new state, for example `ideas: DISABLED`, or
   `(no change)` if it already was. Users see the change on their next page
   load.

Every change is recorded in the audit log as a system change.

## If something goes wrong

- `Set STUDIOFLOW_LOCATION to rumah or kantor.`: step 2 was skipped.
- A message saying the module is core: core modules cannot be switched off.
- A message saying the module is unknown: check the `id` against step 3.
- Any database error: the server's database is not reachable; start it and
  try again. Nothing was changed.
