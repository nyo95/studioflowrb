# StudioFlow role profiles

**Owner decision — 2026-10-19**

StudioFlow uses a small operating matrix. It is policy expressed through the existing permission vocabulary and project PIC facts; application code must never authorize from a role name.

## Profiles

| Profile | Intended person | StudioFlow capability |
| --- | --- | --- |
| Platform Owner | Product/platform owner | All Developer-enabled non-position StudioFlow capabilities, including recovery overrides. Authority, not a project job position. |
| Designer | Junior or Mid designer | Designer PIC eligibility; assigned-project phase work/review, requirements, MOM, schedule, and presentation. Junior/Mid seniority is not an access distinction. |
| Drafter | Any drafter | Drafter PIC eligibility; the same assigned-project working tools, constrained by the existing drafter-seat phase policy. |
| Manager | Ideally a Designer | Full Designer profile plus Clients, all Projects, project metadata, PIC assignment, and read-only portfolio Timeline. |

## Guardrails

- Manager is Designer-capable, not merely a supervisory suggestion.
- `studioflow.project.override` and `studioflow.phase.override` are Platform Owner recovery authority only. No custom profile receives them.
- Platform Owner never automatically receives Designer/Drafter position permissions. An owner selected as a Designer PIC also holds Designer.
- Designer/Drafter do not receive StudioFlow settings, Ideas Board, or project management. Ideas remains deferred.
- Canonical custom codes are `designer`, `drafter`, and `studio-manager` (visible as **Manager**). The migration only replaces their StudioFlow grants; role assignments and unrelated apps remain intact.

## Exact custom-role grants

| Permission | Designer | Drafter | Manager |
| --- | :---: | :---: | :---: |
| `studioflow.access` | Yes | Yes | Yes |
| `studioflow.project.read` | Yes | Yes | Yes |
| `studioflow.project.pic-designer` | Yes | — | Yes |
| `studioflow.project.pic-drafter` | — | Yes | — |
| `studioflow.phase.work` | Yes | Yes | Yes |
| `studioflow.phase.review` | Yes | Yes | Yes |
| `studioflow.task.manage` | Yes | Yes | Yes |
| `studioflow.mom.manage` | Yes | Yes | Yes |
| `studioflow.schedule.manage` | Yes | Yes | Yes |
| `studioflow.presentation.manage` | Yes | Yes | Yes |
| `studioflow.project.manage` | — | — | Yes |

No custom profile has `project.override`, `phase.override`, `settings.manage`, or `ideas.manage`.
