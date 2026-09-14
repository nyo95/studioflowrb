# Active Plan

Plan ID: KB-030-WINDOWS-LOCAL-STORAGE-PATH
Scope: Windows-safe local filesystem storage path validation
Status: READY
Priority: P1
Owner: Repository owner
Target revision: R8.44
Last updated: 2026-09-14

## Outcome

Close KB-030. A valid key written beneath local private storage must receive a
signed read URL on Windows, while traversal, symlink, and junction escapes
remain rejected on every supported platform.

## Context and Evidence

- The full kantor suite against the owner-designated
  `studioflow_rebuild_test` database passes 346/347 tests.
- The only failure is
  `src/platform/infrastructure/storage/filesystem.test.ts`: a freshly written
  `test/image.png` is rejected by `resolveSafePath` during signed-read URL
  creation.
- On Windows, `os.tmpdir()` may expose a short path while `fs.realpath()`
  returns the long canonical path. Comparing a real child path against the
  unresolved root representation can therefore reject a valid descendant.
- KB-028 remains closed only if real symlink/junction escape protection is
  preserved.

## Locked Decisions

- Local filesystem storage remains the selected self-hosted provider.
- Use one canonical containment rule for existing and not-yet-existing paths;
  do not weaken traversal or realpath escape protection.
- Preserve signed URL format, expiry semantics, object-key ownership, and
  public/private route behavior.
- No schema, migration, dependency, permission, or application workflow change.

## Boundaries and Non-goals

- Do not redesign the storage provider interface or activate Supabase.
- Do not alter MOM or Brand mark product policy.
- Do not special-case the current Windows username, temp directory, or drive.

## Acceptance Criteria

1. The focused filesystem tests pass on kantor Windows, including valid signed
   reads, removal, traversal rejection, and symlink/junction escape rejection
   when the OS permits creating the link.
2. Root containment compares canonical representations consistently and still
   handles a target whose final segments do not yet exist.
3. Public and private asset routes continue using the same safe resolver.
4. Full tests have no KB-030 failure; typecheck, lint, boundary,
   legacy-runtime, and production build pass.

## Verification

Run the focused filesystem test first, then the full repository suite against
the owner-designated disposable kantor test database, followed by typecheck,
lint, boundary, legacy-runtime, and production build. Browser smoke is not
required unless implementation evidence shows route behavior changed; this is
an infrastructure path-normalization correction.

## Risks and Recovery

The main risk is fixing short/long Windows path equivalence by weakening the
escape boundary. Keep fail-closed behavior for real paths outside the canonical
root and add focused regression evidence before accepting the change.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and the active `PLAN.md`. Implement the whole KB-030
Windows local-storage correction within its locked security boundary, run the
specified focused and full verification using the approved local acceptance
fixture, update the ledgers, and create local revision R8.44. Finish with only
a copy-ready Planner/Reviewer prompt containing the commit and exact evidence.
