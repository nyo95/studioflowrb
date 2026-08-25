# 14 — UI Engine Design Pass: Handover Back to Codex

Author: Claude (independent design reviewer, then implementer under owner instruction)
Branch: `ui-engine-design-pass`
Base: `1c28100` (tag `ui-engine-design-review-ready`)
Status: implemented, verified, **PM/TL-ratified with bounded convergence corrections**

---

## 1. What this document is

Doc 13 handed Claude a **read-only** design review. That review was delivered
(summary in §7 below). The owner then explicitly lifted the read-only constraint
and directed a second, implementing phase. This document is the record of that
second phase.

**Read §2 first.** Two locked contracts were edited under direct owner
instruction. Nothing here was changed on a reviewer's own authority.

---

## 2. Locked contracts were edited — ratification required

| File | Lock status | Authority for the edit |
| --- | --- | --- |
| `DESIGN.md` | LOCKED | Explicit owner instruction, this session |
| `UI_ENGINE.md` | LOCKED | Explicit owner instruction, this session |

Per `AGENTS.md` authority order, explicit owner instruction outranks the lock, so
these edits are legitimate. They are **not** yet ratified by PM/TL. Treat §3 and
§4 as the change list to review.

Both apps that inherit these contracts (Master Data, BQ) are unbuilt, so no
migration is required — but every rule below now binds them.

---

## 3. Visual contract changes (`DESIGN.md`)

### 3.1 Neutral palette replaced

The previous palette was the Tailwind `slate` ramp taken unmodified. It has been
replaced with a chosen warm-neutral ramp on a white content plane.

| Token | Was | Now |
| --- | --- | --- |
| `--ui-canvas` | `#f8fafc` | `#fbfbfb` |
| `--ui-surface-muted` | `#f1f5f9` | `#f5f4f2` |
| `--ui-border-subtle` | `#f1f5f9` | `#eeedeb` |
| `--ui-border-default` | `#e2e8f0` | `#e0dfdc` |
| `--ui-border-strong` | `#cbd5e1` | `#c2c0bc` |
| `--ui-border-focus` | `#64748b` | `#57534e` |
| `--ui-text-primary` | `#0f172a` | `#1c1a18` |
| `--ui-text-secondary` | `#475569` | `#55524d` |
| `--ui-text-tertiary` | `#94a3b8` | `#6e6a65` |
| `--ui-action-primary` | `#0f172a` | `#1c1a18` |
| `--ui-action-primary-hover` | `#1e293b` | `#332f2b` |

Semantic tokens (danger / success / warning) are **unchanged**.

**Accessibility defect fixed in passing.** The old `--ui-text-tertiary`
(`#94a3b8`) measured **2.56:1** on white — a WCAG 2.1 AA failure (1.4.3, needs
4.5:1). That token carries table headers, eyebrows, placeholders and disabled
labels, all small text. The new value measures **5.37:1** on white and **5.19:1**
on canvas. `DESIGN.md` now states a contrast floor for this token; do not lighten
it back.

This defect was **missed by the original read-only review** and found later while
computing the new ramp. See §7.

### 3.2 New tokens

| Token | Value | Purpose |
| --- | --- | --- |
| `--ui-table-header-bg` | `#1c1a18` | Table header band |
| `--ui-table-header-fg` | `#ffffff` | Table header label + its focus ring |
| `--ui-font-mono` | platform mono stack | Identifier/reference columns. **No web font is loaded** |

### 3.3 Elevation model

Three planes in a fixed relationship, now documented as a table in `DESIGN.md §4`:

| Plane | Occupants | Treatment |
| --- | --- | --- |
| Ground | Page background | `#fbfbfb`, never bordered |
| Plane | Rail, cards, tables, toolbars, topbar | White + 1px border |
| Band | Table header, primary action | `#1c1a18` |

The ground/plane separation is **1.035:1** — near the perceptual floor, and
deliberately so at owner request. **The 1px border is therefore the real edge.**
Any white plane that drops its border disappears. The app rail additionally uses
`--ui-border-strong` (1.82:1) rather than `--ui-border-default`, because
navigation-from-work is a major division and reads as a drawn rule.

### 3.4 Table rules

- `font-variant-numeric: tabular-nums` now applies to the **whole table**, not
  only to end-aligned cells. Identifiers, dates, counts and amounts all contain
  digits; misaligned digit columns force the eye to re-measure every row.
- Identifier columns carry `data-column="identifier"` and render in
  `--ui-font-mono`.
- Header band is near-black. Documented caveat: the band works *because it is the
  only dark element in the data region*. A page stacking several tables must give
  the secondary ones a light header, or the page becomes stripes.
- Header type raised 10px → 11px, tracking loosened 0.11em → 0.08em, tone dropped
  from secondary to tertiary and weight 700 → 600. It labels the data; it no
  longer competes with it.

### 3.5 Status presentation changed — behavioural

`StatusBadge` no longer renders a filled pill. It renders a 7px semantic marker
plus a **plain-ink** label.

Rationale, and why this is also an a11y improvement: the pill coloured its label
with the tone's own foreground (`Warning` measured 4.84:1 on its tinted
background). The marker keeps every label at **17.35:1** and the text carries the
meaning, so colour is never the only channel (1.4.1). The marker dot itself
measures 5.37:1 against white, clearing the 3:1 non-text requirement (1.4.11).

`Badge` (pill) is retained and is now explicitly the component for chips, tags and
counts. The showcase demonstrates both side by side so the choice is visible.

### 3.6 Navigation orientation rule (new)

Every rail must mark its current entry, on **more than one channel**. Hover
already owns the muted fill, so a fill-only active state is indistinguishable from
"my cursor is here". See §4.3.

---

## 4. Public API changes (`UI_ENGINE.md`)

All four additions are additive. No existing call site breaks.

### 4.1 `DescriptionList` gained `columns`

```tsx
<DescriptionList columns={1}>  {/* default 2 */}
```

This exists because the read-only review's proposed fix for finding **B-1 was
wrong**: it recommended passing `columns={1}`, but no such prop existed — the
two-column layout was hard-coded in CSS. See §7.

Engine hardening shipped alongside it: `.ui-description-item dd` changed from
`overflow-wrap: anywhere` to `break-word`. `anywhere` was the actual mechanism
that shredded a value into one character per line when the column was crushed to
9px.

### 4.2 `AppShell` gained a collapsible rail

232px ⟷ 60px icon rail. Opt-in via `collapsible`; off by default, so existing
shells are untouched.

| Prop | Type | Default |
| --- | --- | --- |
| `collapsible` | `boolean` | `false` |
| `collapsed` | `boolean` | — (controlled) |
| `defaultCollapsed` | `boolean` | `false` |
| `onCollapsedChange` | `(collapsed: boolean) => void` | — |
| `collapsedBrand` | `ReactNode` | falls back to `brand` |
| `expandLabel` / `collapseLabel` | `string` | "Expand/Collapse navigation" |

The engine owns the affordance, widths, transition (respects
`prefers-reduced-motion`) and `aria-expanded`. It **does not persist** the choice —
persistence is app state.

`shells.tsx` is now `"use client"`. It was only ever consumed by a client
component, so nothing regressed, but note that `PageShell` and `PageHeader` now
live in that file too.

### 4.3 `NavItem` — new component

```tsx
<NavItem href="/skus" icon={<Table2 />} active={pathname === "/skus"}>SKUs</NavItem>
```

**Deliberately engine-owned rather than app-owned.** "Where am I" must look and
announce identically in all three apps; an active state re-implemented three times
drifts three ways. The app decides *what* is current; the engine decides how
current *looks and announces*.

- `active` sets `aria-current="page"`.
- Active is marked on three channels at once: ink rule (3px), muted fill, and
  ink-coloured 500-weight text. Verified distinct from idle on all three. **Do not
  reduce this to fill alone.**
- Collapsed rail: the label is hidden *visually* — never `display: none` — and a
  `Tooltip` restores it on hover. Apps wire neither.

**Bug fixed during this work:** the first collapsed-rail implementation used
`display: none` on the label, which also strips it from the accessibility tree.
That left all six nav links with **no accessible name** (4.1.2 / 2.4.4). The
prohibition is now written into `UI_ENGINE.md`.

### 4.4 `TableHead` gained a sort affordance

```tsx
<TableHead
  sortable
  align="end"
  sortDirection={sort?.key === "amount" ? sort.direction : null}
  onSortChange={(direction) => setSort({ key: "amount", direction })}
  sortLabel={(d) => `Amount, sort ${d === "asc" ? "ascending" : "descending"}`}
>
  Amount
</TableHead>
```

This looks like it collides with the existing rule that apps own "sort/filter
semantics". It does not — the same clause assigns presentation and accessibility
to DataTable. The split is now explicit in `UI_ENGINE.md §7`:

| UI Engine | App |
| --- | --- |
| Header renders as a `<button>` | Which columns are sortable |
| Direction indicator | The comparator per column |
| `aria-sort` on the `<th>` | Client-side vs server query |
| Keyboard activation, focus ring | Tie-breaking, default order |

The engine holds **no sort state**, so a server-sorted and a client-sorted table
use identical markup. Clicking toggles asc/desc.

Why the comparator cannot live in the engine: a date sorts by its timestamp, not
its printed label; an amount sorts by its number, not its formatted string. A
generic engine comparator would sort `"12,880.00"` before `"18.00"`. The showcase
now carries a worked example (`compare` map) demonstrating exactly this.

Focus note: the header band is near-black, so the sort control draws its focus
ring in `--ui-table-header-fg`. The global focus colour is invisible there.

---

## 5. Showcase changes (`/ui-engine`)

Not contract, but it is the reference app teams will copy, so it was brought up to
standard:

- Table data replaced with 12 rows carrying **numeric** columns (`items`,
  `amount`) and an ISO `updatedAt` separate from its printed label. The previous
  3 rows of pure text exercised neither alignment nor sort semantics, which is
  part of why the kit read as flat.
- Sort is wired for all 7 data columns; selection and row-action columns are
  correctly not sortable.
- Nav uses `NavItem` with a **scroll-spy** driving `active`. A first attempt used
  `hashchange`; it was replaced because a hash goes stale the moment the user
  scrolls, and because `hashchange` does not fire reliably when the hash changes
  without a remount. The rail should answer "where am I", not "what did I last
  press".
- `Heading` levels 5 and 6 added to the typography card (review finding B-2).
- `Badge` and `StatusBadge` shown side by side.
- Local nav styling removed from `showcase.module.css` now that the engine owns it.

---

## 6. Verification performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npm run check:boundaries` | Architecture boundaries OK |
| `npm run check:legacy-runtime` | No legacy runtime references OK |
| `npm test` | **pass — run by the owner on Windows** |
| React hydration errors | 0 |
| Contrast, all text tokens | >= 4.5:1 on both white and canvas |
| `aria-sort` per column | correct; absent on non-data columns |
| `aria-current` | exactly one at all times, tracked across scroll |
| Collapsed-rail accessible names | all six present |
| Focus ring on near-black band | white, visible |

`npm test` could not be run from this session: `node_modules` contains the
Windows esbuild binary (`@esbuild/win32-x64`) and the working shell was Linux.
The owner ran it and reported pass.

### Not verified

- **Viewport <= 1024px.** The browser viewport could not be reduced below 1912px
  with available tooling. The responsive CSS was read and is structurally sound
  (breakpoints at 1100 / 840 / 720 / 560 / 520px), but 840px and 390px were never
  seen. **This is the first thing the next agent should check.**
- 200% browser zoom.
- Print preview (the `print.css` source was reviewed; no live print dialog was
  triggered).
- Tooltip on the `?` icon button in Controls -> Actions.

---

## 7. Corrections to the original read-only review (doc 13 output)

Recorded because that review may be read on its own:

1. **Finding B-1's proposed fix was wrong.** It said to pass `columns={1}` to
   `DescriptionList`. No such prop existed. The prop had to be added (§4.1). The
   diagnosis was right; the remedy was not.
2. **A defect was missed.** `--ui-text-tertiary` at 2.56:1 was a live WCAG AA
   failure present in the reviewed commit and not reported (§3.1).
3. **"No relevant skill exists" was wrong.** Only account-level skills were
   checked; the `design` plugin (`design-system`, `accessibility-review`,
   `design-critique`, `design-handoff`) was already installed. Two of these were
   used in the implementing phase.

---

## 8. PM/TL decision record

1. **Contract changes in §3 and §4: ratified**, subject to the convergence
   corrections recorded in §9.
2. **Border weight vs ground depth: retained.** The ground remains at 1.035:1 by
   owner preference; live viewport review found the 1px surface edges sufficient.
3. **Radius: retained at 8px.** Programa is directional visual evidence, not a
   literal component specification.
4. **Density: retained.** The 14px base / 36px control remains the shared default;
   BQ may use the already-authorized denser composition when its product evidence
   requires it.
5. **Master Data gate: closed.** Responsive checks and owner approval passed.

---

## 9. PM/TL ratification and final convergence (2026-08-25)

The owner explicitly approved the current visual direction over the superseded
initial `DESIGN.md` interpretation and asked PM/TL to close remaining regressions.
PM/TL therefore ratifies the additive contract changes in §3 and §4, with the
following bounded corrections in commit `8f1ca0b`:

- `DESIGN.md` now records the warm-neutral direction, correct tertiary token,
  selected-row treatment, and narrow-navigation rule;
- selected rows retain a checked control plus a restrained ink leading rule,
  while ACTIVE/WARNING/DANGER remain independent semantic status markers;
- all seven showcase data columns were exercised as sortable; selection and
  action columns remain intentionally non-sortable;
- narrow layouts always expose navigation labels while preserving the stored
  desktop collapse preference;
- Combobox ArrowUp/ArrowDown/Home/End navigation skips disabled options, and
  Enter/Escape selection/closure returns focus to the trigger;
- warm-neutral focus/overlay/print literals replace the remaining slate literals.

Final evidence: 117 tests, typecheck, boundary and legacy-runtime fixtures,
Prisma validate/generate, production build, and diff checks pass. Live review
passed at 1440×900, 1024×768, 768×1024, 390×844, and a 720×450 effective
viewport representing the 1440×900 layout at 200% scale. The console remained
free of warnings/errors. DocumentSheet retained A4 proportion and loaded its
isolated `@media print` contract; native OS print-preview automation was not
available and is not treated as a blocker for this gate.

UI Engine is final for product implementation. A later change requires concrete
product evidence and a new PM/TL decision; Master Data must compose the locked
public inventory rather than redesign it.

---

## 10. Owner browser-feedback refinement (2026-08-25)

Before Master Data execution began, the owner supplied three concrete comments on
the live Data Directory. Commit `160d2f6` resolves them as a final contract-level
refinement:

- selection count and batch actions now use `SelectionBar variant="inline"`
  beside Export in the shared toolbar instead of consuming a separate full-width
  strip;
- rail, brand, utility identity, and sticky topbar were redesigned as one quiet
  application frame; the table header moved from a repeated near-black band to a
  warm-neutral structural surface with a strong lower rule;
- `TableCell wrap` plus `TableCellContent` now provide consistent one/two-line
  primary content and optional secondary metadata, including end-aligned numeric
  content.

Live browser evidence at 1184×912 showed no page overflow, a 64px topbar, the
232px expanded rail, selection and Export aligned in one toolbar row, and stable
35px two-tier cell content. Sort affordances and semantic status markers remain
independent and unchanged. This refinement supersedes the first UI-approved
Master Data tag; execution starts from `masterdata-full-build-start-ui-approved-v2`.
