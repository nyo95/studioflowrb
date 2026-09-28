# Active Plan

Plan ID: WO-SR-01
Scope: Sample requests (StudioFlow asks, Master Data works them) and the platform notifications that announce them
Status: IN PROGRESS — executed directly by the Lead (owner: "kamu langsung take over", 2026-09-29; Codex was at its limit). Not independently reviewed.
Priority: P2
Owner: owner (Product Owner); Lead: Claude
Last updated: 2026-09-29

The previous plan, WO-BE-03 (executed in R8.181, awaiting independent review), is preserved in git history at `f69d5f9`.

## Outcome

1. Master Data staff have an "incoming sample requests" queue fed by StudioFlow. They take a request, note the
   vendor's quote, and finish it as priced or declined, without StudioFlow's data being touched.
2. Staff are told when a request arrives, and the designer who asked is told when it is priced or declined, through
   a platform-level in-app notification inbox (a bell).

## Locked decisions (Lead's defaults, recorded because the owner delegated the choice; the owner may veto)

- **New permission** `masterdata.sample-request.manage` gates the queue and every action (not an existing pricing permission).
- **Independent facts.** Master Data marking a request priced or declined never changes StudioFlow's request status.
  "Priced" and "the physical sample reached the designer" are different moments; StudioFlow's `RECEIVED` stays the designer's.
- **Version one records; it does not create.** Staff note the quote and may link an existing vendor, SKU, or material price
  by id. Creating the SKU and price still happens in the existing Master Data screens.
- **No cross-schema coupling.** StudioFlow exposes a read-only public contract; Master Data keeps its own intake row with
  snapshot facts and plain-id links; the shell coordinator (`src/application`) joins the two. Neither app imports the other.
- **A request that becomes RECEIVED before anyone in Master Data takes it drops out of the queue**; one already taken stays
  until finished. Requests from archived projects are hidden and cannot be taken.
- **Notifications:** who is told and when is above; delivery is polling (about a minute and on navigation), no real-time
  channel, no email. Private user-to-user messaging is a separate, still-blocked item and is not part of this plan.

## Phases

- **R8.183 (done):** StudioFlow read contract `createStudioFlowSampleRequestRead`; Master Data permission, `SampleRequestIntake`
  table (additive migration `20260929000000_masterdata_sample_request_intake`), intake service and runtime commands;
  coordinator `src/application/sample-request-coordinator.ts` and shell wiring `src/app/sample-request-runtime.ts`.
- **Next:** platform notifications (schema, writer port, read service, actions) and the two events; the Master Data
  "Sample requests" screen with its actions; the notification bell and inbox.

## Risks

Highest risk is authorization drift between apps, so the coordinator authorizes before it reads StudioFlow and Master Data
re-checks the permission in every command. Recovery is a plain revert per revision; the migrations are additive.
