# Known Bugs by Application

Status: active defect ledger, reconciled through R7.53 on 2026-09-10.

Planned features belong in [`roadmap.md`](roadmap.md). When a bug is fixed, move
it to Closed, name the revision, and record the fix in `CHANGELOG.md`.

## Platform Foundation

No open Foundation bug is currently recorded.

## UI Engine and Shared Utilities

### KB-004 — Shared image provider is not provisioned in kantor

- **Observed:** R7.52 provides the canonical UI Engine ImageWorkspace, Core
  storage port, fake seam, and server-only Supabase adapter, but `.env.kantor`
  has no Supabase provider credentials and no production bucket has been
  provisioned.
- **Expected:** One public UI Engine capability with consumer-owned policy and
  cross-consumer regression evidence.
- **Mitigation:** MOM image persistence fails safely until the provider is
  configured; tests use the fake adapter and no local filesystem fallback.
- **Status:** Open; implementation complete, environment provisioning remains.

## Master Data

No open Master Data bug is currently recorded. Deferred media, Samples, and
import/export capabilities are roadmap items, not defects.

## BQ

No open BQ bug is currently recorded.

## StudioFlow

### KB-002 — Storage-byte retention policy is not finalized

- **Observed:** MOM removes unreferenced draft image objects best-effort, while
  long-term retention and reconciliation for superseded records is not approved.
- **Expected:** Retain metadata/audit and release bytes under approved retention.
- **Mitigation:** Keep immutable MOM metadata and audit rows; do not claim byte
  cleanup is complete until provider provisioning and retention policy exist.
- **Status:** Open; blocked by retention policy/provider provisioning.

### KB-003 — Project Schedule/FFNI remains absent from project detail

- **Observed:** MOM and Product Catalogue are implemented in R7.52/R7.53;
  Project Schedule/FFNI remains unimplemented.
- **Expected:** Project-owned MOM and Schedule surfaces plus a StudioFlow-owned
  Product Catalogue reuse pool shared across StudioFlow projects. MOM remains
  independent from phase/iteration/Task; Product Catalogue never reads Master
  Data SKU, unit, or pricing.
- **Mitigation:** Continue using existing operational surfaces for Schedule/FFNI.
- **Status:** Open; intentionally deferred to its own executable work order.

### KB-005 — Add Project regresses legacy client/modal behavior

- **Observed:** Client creation is not available in context and some project
  creation interactions navigate away instead of opening a modal.
- **Expected:** Restore useful legacy behavior using UI Engine dialogs and the
  current project/client service boundary.
- **Mitigation:** Create the client first, then create the project.
- **Status:** Closed in R7.44. Project creation now supports selecting an
  existing client or creating a new client in context, atomically with the
  project and its seeded phases, with audit coverage.

### KB-006 — StudioFlow UI language remains mixed

- **Closed:** R7.46 completes the R7.44 correction. User-facing StudioFlow
  route, validation, service-error, nested iteration, client, file, and state
  copy is English. Remaining Indonesian matches are technical comments,
  sample proper names, or internal anchor ids.

### KB-007 — Settings structure does not match useful legacy behavior

- **Observed:** Rebuild Settings remains narrower than legacy.
- **Expected:** Reproduce useful legacy structure with current permissions and
  rebuilt UI Engine components.
- **Mitigation:** Use current General Settings.
- **Status:** Closed in R7.44. Studio Settings now links the existing functional
  Clients and Account/Profile surfaces alongside phase and naming settings.
  Database Settings remains intentionally deferred because its backend contract
  does not exist.

## Closed

### KB-001 — Deliverable intake did not drive iteration lifecycle

- **Closed:** R7.40. Intake opens/reuses the draft, replaces the prior unsent
  current file, and attaches it to the iteration when sent.

### KB-008 — BQ overridden prices had no Revert action

- **Closed:** R7.40. The permission-checked action restores the immutable source
  price snapshot.

### KB-009 — BQ Updated date was missing or inconsistently placed

- **Closed:** R7.40. BQ directories display persisted update values.

### KB-010 — Library redirected instead of exposing resource links

- **Closed:** R7.40. A read-only UI Engine dialog exposes Master Data resources.

### KB-011 — StudioFlow implements drag/drop outside the UI Engine

- **Closed:** R7.43. UI Engine now exports the canonical metadata-only
  `FileDropZone`; StudioFlow consumes it and no longer owns drag/drop handlers.
  Focused UI Engine behavior/accessibility tests and the app boundary guard pass.
- **Limitation:** Full integration tests and live browser verification remain
  unavailable until the disposable office test database and browser workflow
  are available.

## Audit protocol

1. Record route, action, expected/actual behavior, boundary, and reproduction.
2. Fix immediately only when safe, scoped, and verified.
3. Otherwise add/update the relevant app section with mitigation and status.
4. On fix, move the item to Closed and update `CHANGELOG.md` and the roadmap.
