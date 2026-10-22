# StudioFlow Schedule Assistant MCP bridge

One local MCP server (stdio) that lets Claude Code, Codex, OpenCode or Gemini CLI compose
one StudioFlow project's Product Schedule. The bridge only forwards to StudioFlow's
`/api/integrations/v1/schedule-assistant` routes with your personal token; StudioFlow
decides every code, option label and Brand snapshot, and new options are never final.
No AI provider key is involved on the StudioFlow side.

Contract: `docs/apps/schedule-assistant/CONTRACT.md`.

## Before you start

1. The Developer switches on the **Schedule Assistant** module at `/system` and adds your user to
   "AI and plugin access" there. This is not a Role: even the Platform Owner is not allowed until listed.
   You still need the normal Schedule permission and assignment to the project.
2. On **Account → Integration tokens**, create a token with both
   "Schedule Assistant: read project schedules" and "Schedule Assistant: change project
   schedules". The secret (`sfk_…`) is shown once.
3. Install the bridge once (Node 20 or newer):

   ```bash
   npm --prefix tools/schedule-assistant-mcp ci
   ```

4. Put the secret in an environment variable of your own shell profile, never in a file
   that is committed or shared:

   ```bash
   export STUDIOFLOW_TOKEN=sfk_xxxxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

The bridge reads two variables: `STUDIOFLOW_URL` (https, or http only for
`localhost`/`127.0.0.1`/`::1`) and `STUDIOFLOW_TOKEN`. Below, replace
`/ABSOLUTE/PATH/TO` with the folder of this checkout and the URL with your server
(the local dev server is `http://localhost:3001`).

**Never auto-approve `apply_schedule_changes`.** It is the only tool that changes data.
Let the client ask you every time, after you have read the preview.

## Claude Code

```bash
claude mcp add --scope user --env STUDIOFLOW_URL=http://localhost:3001 --env "STUDIOFLOW_TOKEN=${STUDIOFLOW_TOKEN}" --transport stdio studioflow-schedule -- node /ABSOLUTE/PATH/TO/tools/schedule-assistant-mcp/server.mjs
```

User scope keeps the token out of the project's `.mcp.json`. Check with `claude mcp list`.

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.studioflow-schedule]
command = "node"
args = ["/ABSOLUTE/PATH/TO/tools/schedule-assistant-mcp/server.mjs"]
env_vars = ["STUDIOFLOW_TOKEN"]
default_tools_approval_mode = "writes"

[mcp_servers.studioflow-schedule.env]
STUDIOFLOW_URL = "http://localhost:3001"
```

`env_vars` forwards the token from your shell; `"writes"` asks before the one
non-read-only tool. Check with `codex mcp list`.

## OpenCode

User config `~/.config/opencode/opencode.json` (not a project file, because the value is
written literally):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "studioflow-schedule": {
      "type": "local",
      "command": ["node", "/ABSOLUTE/PATH/TO/tools/schedule-assistant-mcp/server.mjs"],
      "enabled": true,
      "environment": {
        "STUDIOFLOW_URL": "http://localhost:3001",
        "STUDIOFLOW_TOKEN": "sfk_…"
      }
    }
  }
}
```

## Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "studioflow-schedule": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/tools/schedule-assistant-mcp/server.mjs"],
      "env": {
        "STUDIOFLOW_URL": "http://localhost:3001",
        "STUDIOFLOW_TOKEN": "$STUDIOFLOW_TOKEN"
      },
      "trust": false
    }
  }
}
```

Keep `"trust": false` so every tool call is confirmed.

## How it guards your data

1. **Interview first.** The assistant must confirm the project (and ask when more than
   one matches), ask what you want, ask for missing facts (Fixture quantities, a Brand
   that is not in Master Data), summarise the plan, and only then prepare a preview. In
   clients that list MCP prompts, start it with the `susun_jadwal` prompt (for example
   `/mcp__studioflow-schedule__susun_jadwal` in Claude Code).
2. **Only a preview made here can be applied.** The bridge refuses an apply whose preview
   was not made in the same session for exactly the same changes (`APPLY_NOT_PREVIEWED`).
3. **StudioFlow asks you itself.** In clients that support MCP dialogs (elicitation —
   Claude Code ≥ 2.1.76, Codex CLI recent versions), the bridge shows its own question,
   for example *Terapkan ke Product Schedule "Sociolla SBW R1": 2 item baru … Ya,
   terapkan?* Nothing is saved unless you tick it. Other clients use their own tool
   approval, except for final decisions (below).
4. **Final decisions are stricter.** `finalize_option` marks one named option as the client's
   final choice and sets the item's other options to "not used". There is no "all" form: the
   AI names each option, lists every code, and the bridge applies a batch with final decisions
   only after its own dialog (it refuses clients without MCP dialogs, so a cheap or free model
   with auto-approve cannot lock options). Undoing a final stays on the Schedule screen.
5. **Photos come only from you.** Paste or drop a picture into the conversation; the AI passes
   its file path, the bridge checks it is really a PNG/JPEG/WebP of at most 3 MB (at most four
   per batch) and locks it to the preview. No links from the internet. When a new option has no
   photo, the AI asks you for one and, if there is none, whether to use a colour placeholder and
   which colour; StudioFlow draws the placeholder. Removing a photo stays on the Schedule screen.

## Using it

Ask in plain words, for example: *"In project Heloskin Cimanggu, apply the studio
templates, add a Fixture downlight, 12 pcs, Philips DN020, and a second option Osram."*
The client should call `list_projects`, `get_schedule_context`, then
`preview_schedule_changes`, show you the preview, and only after your yes call
`apply_schedule_changes`, which also reads the saved rows back.

| Tool | Changes data |
|---|---|
| `list_projects` | no |
| `get_schedule_context` | no |
| `search_brands` | no |
| `search_reusable_options` | no |
| `preview_schedule_changes` | no (dry run) |
| `apply_schedule_changes` | **yes**, all or nothing, safe to retry |

If apply answers `SCHEDULE_PREVIEW_STALE`, someone changed the schedule after the
preview: preview again and approve again.

## Development

```bash
npm --prefix tools/schedule-assistant-mcp test
```
