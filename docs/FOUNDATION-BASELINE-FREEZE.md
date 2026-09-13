# Foundation Baseline and Continuation Freeze

**Status:** PF-0 implemented in R8.18; awaiting independent review.
**Scope:** Project Rebuild Foundation governance record only. This record does
not change application, platform, schema, or runtime behavior.

## Rebuild references

- **Approved behavior/reference baseline:** `nyo95/studioflowrb` R8.12 —
  `45d74884c1ec268b30b1d5e6dc86a80da32cffe7`.
- **Current planning checkout overlay:** `nyo95/studioflowrb` R8.16 —
  `edcd1b287de396440db1a36004b873e7c0410eee`.

R8.16 is a documentation-only planning overlay on the approved R8.12
behavior/reference baseline. It is not an independently verified behavioral
baseline and must not be used to make a parity claim.

## Legacy evidence metadata

The pinned legacy evidence identity is `nyo95/studioflow` at
`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`.

PF-0 records that identity as metadata only. It does not authorize locating,
opening, or otherwise accessing a legacy checkout, and it prohibits all legacy
database access.

## Freeze boundary

Foundation work must preserve the behavioral state of Master Data and BQ.

Normal StudioFlow continuation is frozen before PF-8: no StudioFlow feature,
route, schema, service, UI, or behavior work is allowed. The sole exception is
an explicitly planned and approved security, data-integrity, or
repository-breaking correction. An approved Foundation slice may make only the
deterministic StudioFlow consumer compatibility change it requires, without
changing StudioFlow business behavior.

## Release condition

PF-0 establishes the baseline and freeze; it does not release the Foundation or
StudioFlow Recovery gate. That gate is released only by PF-8, after the
Foundation verification and freeze are documented and versioned. StudioFlow
Recovery begins only after that PF-8 condition is met.
