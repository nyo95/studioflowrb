# Turning modules on and off from the server

Use this runbook to switch an optional module (for example Ideas Board or
Presentation) on or off directly on a StudioFlow server. This remains the
maintenance path while the Developer web console is being built and is also a
fallback when that console is unavailable.

Switching a module off hides it from everyone and makes its permissions
temporarily inactive. **Its data and Role grants are kept** and return exactly
as they were when the module is switched on again.

Core modules (StudioFlow, Master Data and BQ) cannot be switched off. Only the
Developer, with terminal access to the server, can run these commands. No app
account, including the Platform Owner, can switch modules; Settings > Modules
shows the current state read-only.

## Steps

1. Open PowerShell on the server and go to the StudioFlow folder.
2. Select the local configuration (`kantor` at the office, `rumah` at home):

   ```powershell
   $env:STUDIOFLOW_LOCATION = "kantor"
   ```

3. List every module and its current state:

   ```powershell
   npm run studioflow -- module list
   ```

   The table shows each module's `id`, version, `core` or `optional`, and
   `ENABLED` or `DISABLED`.

4. Switch an optional module using its `id` from that table:

   ```powershell
   npm run studioflow -- module disable ideas
   npm run studioflow -- module enable ideas
   ```

   The command reports the new state, or `(no change)` when it already matched.
   Users see the change on their next page load. Every change is recorded in
   the audit log as a Developer system change.

## If something goes wrong

- `Set STUDIOFLOW_LOCATION to rumah or kantor.`: step 2 was skipped.
- A message saying the module is core: core modules cannot be switched off.
- A message saying the module is unknown: check the `id` from step 3.
- A database error: the rebuild database is not reachable. Start its local
  service and try again; the command did not complete the requested change.
