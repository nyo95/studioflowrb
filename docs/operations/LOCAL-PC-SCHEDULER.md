# Local PC scheduler

Use this runbook when StudioFlow runs on one always-on Windows PC. It schedules
the cleanup of expired private Messenger attachments without relying on a
browser session or Next.js development server.

## What it does

`npm run cleanup:messenger` removes the private object bytes for Messenger
attachments that expired more than 30 minutes ago. It leaves the message and
the attachment's history row in place, marked unavailable. Each run processes
at most 2,000 attachments, so a delayed machine can catch up safely over later
runs.

The command loads either `.env.rumah` or `.env.kantor`, selected by
`STUDIOFLOW_LOCATION`. Those files remain local-only and must never be copied
into the task definition, source code, or Git.

## One-time verification

From the repository directory, run:

```powershell
$env:STUDIOFLOW_LOCATION = "rumah"
npm run cleanup:messenger
```

An empty system reports zero removed attachments and is successful.

## Windows Task Scheduler setup

Create one task on the PC that actually runs the production application:

1. Open **Task Scheduler** and choose **Create Task**.
2. Set **Run whether user is logged on or not** and use the same Windows
   account that owns the StudioFlow folder and storage directory.
3. Create a daily trigger at 03:00. Enable **Run task as soon as possible
   after a scheduled start is missed**.
4. Add an action with the repository as **Start in**. Run this command:

   ```text
   cmd.exe /d /s /c "set STUDIOFLOW_LOCATION=rumah&& npm run cleanup:messenger"
   ```

   Use `kantor` instead only on the office PC.
5. Set **Do not start a new instance** if the task is already running. This
   prevents overlapping cleanup runs after a slow disk or a large backlog.
6. Save the task and use **Run** once. Review its History and the command's
   output before relying on the daily trigger.

## Operating notes

- Run StudioFlow in production mode (`npm run build`, then `npm run start`),
  not `npm run dev`. The development server is for local changes only.
- Keep the PC running at the scheduled time, or let Task Scheduler run the
  missed task on the next startup.
- If the application later moves to hosted infrastructure, retain the cleanup
  command and replace only this Task Scheduler trigger with that host's
  scheduler. Do not run both schedules at once.
- A failed cleanup leaves the expired database row untouched, so the next run
  can retry it. Investigate repeated failures through the scheduled task's
  History and the application storage location.
