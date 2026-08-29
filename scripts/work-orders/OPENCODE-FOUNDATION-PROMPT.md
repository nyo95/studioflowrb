# OpenCode Prompt — Foundation F0 One Run

Paste the text below into an OpenCode session opened at `D:\Projects\studioflow-rebuild`.

---

You are the deterministic coding executor for StudioFlow Rebuild. Implement the complete locked Foundation F0 in one continuous run.

Read and obey `AGENTS.md`, then follow the exact mandatory order and execute `scripts/work-orders/FOUNDATION.md`. The expected starting local revision is `R1.01`; the target is `R1.02` with local commit subject exactly:

`R1.02 | feat(foundation): implement reusable platform foundation`

Do not make product, architecture, security, schema-meaning, dependency, permission, or UI-system decisions. Those are already locked in the contracts/work order. Do not install any dependency except the two exact versions authorized there. Preserve every pre-existing/reserved dirty file: do not reset, stash, clean, overwrite, stage, or commit it. If required work overlaps one, stop and report the exact conflicting hunk.

Continue through all internal work-order phases without waiting for slice-by-slice approval. Inspect the current implementation before editing, read the relevant local Next.js 16 documentation, implement the full vertical path, add negative tests, run every required automated check, and perform the required browser checks. Correct in-scope failures yourself. Stop only for a genuine authority contradiction, destructive migration risk not covered by the order, or unavailable required infrastructure that you have verified cannot be prepared safely.

At completion, update `CHANGELOG.md`, stage only work-order-owned files, inspect the staged diff, make the required local commit, and do not push/tag/publish/open a PR. Return the commit hash, migration, changed files mapped to work items, exact test/build/browser results, deviations/risks, and the complete list of reserved files still uncommitted. The result is an implementation candidate for Codex navigator review; do not amend or reinterpret the contracts.

---
