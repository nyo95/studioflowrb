# Active Plan

Plan ID: PF-1-VERIFICATION-CLOSURE-R8
Scope: Provider-backed verification of Platform Brand mark storage
Status: BLOCKED
Priority: P1
Owner: Repository owner / deployment operator
Target revision: R8.27 (planning ledger)
Last updated: 2026-09-13

## Outcome

Close PF-1 only after the deployed Supabase storage configuration proves the
two-bucket security boundary end to end: an unauthenticated user can read a
Brand mark from `platform-public-assets`, while a MOM object in private
`platform-assets` cannot be read through a public URL. Preserve the accepted
R8.25/R8.26 implementation and do not change Master Data, BQ, or StudioFlow
behavior.

## Context and Evidence

- R8.25 (`c4061f3`) implemented the storage split and additive
  `brand_mark_storage_key` migration.
- R8.26 (`358c61c`) corrected the request-size headroom, CORE storage contract,
  cleanup reporting, and revision ledger.
- Independent verification now passes: full suite 343/343, typecheck, lint,
  boundary check, legacy-runtime check, production build, and staged-diff
  whitespace check.
- The provider credentials and buckets are not provisioned in the current
  environment. Browser/provider evidence is therefore unavailable, and
  `KB-004` remains open.

## Locked Decisions

- Keep `platform-public-assets` public for anonymous Brand mark reads only.
- Keep `platform-assets` private for MOM and other private objects; MOM uses
  signed reads only and must never receive a public URL.
- Upload, replacement, deletion, and listing remain server-only for both
  buckets. No service-role credential may reach browser code or responses.
- Durable settings keep a managed storage key, never a signed URL; existing
  safe external/site-relative URLs remain supported.
- This plan authorizes verification and evidence capture only. It does not
  authorize a new schema, storage abstraction, dependency, provider migration,
  or application feature.

## Blocker and Required Evidence

The owner/deployment operator must provision the two approved buckets and
server-only credentials in the intended verification environment, then provide
evidence for all of the following:

1. Login renders a managed Brand mark without authentication.
2. A direct anonymous request to the Brand mark public URL succeeds.
3. A direct anonymous request to a MOM object public URL fails.
4. MOM still renders through its signed URL path for an authorized workflow.
5. Anonymous upload, list, replace, and delete attempts are rejected for both
   buckets; server-side operations continue to work.
6. No service-role secret, signed token, or raw provider error appears in
   browser output, action responses, audit data, or logs.

Until this evidence exists, the reviewer must not mark PF-1 PASS or close
KB-004. No Executor run should begin; this is an external provisioning gate.

## Next After Unblock

Once this plan passes, replace it with a READY plan for **F-B / PF-2+PF-3**:
canonical per-app permission vocabulary and registration metadata, public route
helpers/navigation definitions, central composition using public metadata only,
and preserved existing route behavior without StudioFlow route redesign.
