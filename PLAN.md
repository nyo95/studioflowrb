# Active Plan

Plan ID: WO-SF-NOTES-PRESENTATION-IMAGE-01
Scope: Run 1 study, audit and plan only; no application implementation
Module(s): studioflow (Notes and Schedule reads), presentation, shared platform UI Engine image patterns; workspace-board is an unchanged optional view of the same StudioFlow records
Target revision: R9.64 documentation; later slice revisions allocated from CHANGELOG.md after Lead approval
Status: DRAFT
Priority: P1 recommended for A; P2 for B/C/D, subject to owner priorities
Owner: Product Owner; Lead approves and locks each READY slice
Last updated: 2026-10-15

## Outcome

This run delivers an evidenced audit and reviewable plan. Run 2 starts only after the Lead's OK and resolution of the decision gates. No fixes or Reviewer acceptance are claimed by R9.64.

Proposed final outcome: official records preserve historical evidence; ordinary edits reject stale versions and keep Schedule links consistent; refreshing retains the reader's selected view; existing General notes can be edited under their established rights with Board off. Mentions open useful suggestions immediately. Presentation pins move without moving their image, destructive changes are confirmed, board reads do not write, and shared image previews agree with saved output for every consumer.

## Context and Evidence

### Baseline, environment and authority

- Location: **kantor**. Initial HEAD `b3d0fe5872db8d8bc5919cad8b234c7f458eaeb6` (R9.53), branch `main`, ten commits behind the already-local origin/main. Owner explicitly approved a local fast-forward to the required baseline. No fetch/pull/push, PR or merge commit was made.
- Audit/pre-edit HEAD and origin/main: `ed169fb59b83349b4530995fdef8117c8814d966` (R9.63). Published whole revision R9; latest local/published ledger entry R9.63. Next unused revision: **R9.64**.
- Complete pre-existing dirty list: untracked `test/BOQ TEST.xlsx` and `test/BOQ TEST 2 - PDF.pdf`. Preserve both; neither is an audit fixture or staged file.
- Owner's 2026-10-15 Work Order authorizes Run 1 planning and later UI polish in Notes, Presentation and shared image patterns. It does not authorize other shared editor/formatter changes, new dependencies/schema/migrations, or remote actions.
- Authority read: AGENTS.md, EXECUTOR.md, agent README/revision protocol, PLAN-TEMPLATE.md; scoped UI_ENGINE.md ownership/tokens/overlays/actions; DESIGN.md fixed frame/responsive/interaction rules; StudioFlow rework contract §6.1; module decision record. Existing implementation/tests are evidence, not authority to change product decisions.
- **Material contract conflict:** `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md:302` explicitly permits correcting/deleting workflow-record text; `src/apps/studioflow/service.integration.test.ts:3822` tests that permission. A1 confirms this behavior and the newly requested integrity change; it does not prove violation of the prior policy. G1 must replace that policy before execution. The contract's older Board-off description also predates the R9.61 project chat; do not restore the older phase-only stream.
- Ignored office/test settings identified only localhost:5433 databases `studioflow_rebuild` and `studioflow_rebuild_test`. Both lacked the already-committed Notes-chat migration. Per the baseline-sync rule, existing `20261014230000_studioflow_note_chat` was deployed to both and the ignored Prisma client regenerated. This authored no migration/schema/dependency source. Tests used only the guarded disposable test DB. No credentials printed/copied/committed; no legacy inspected.

### Evidence key and method

Line numbers refer to R9.63. Keys below expand to exact paths; for example N:421 is the exact file in the N row, line 421.

| Key | Repository path |
| --- | --- |
| N | `src/app/(platform)/studioflow/projects/[projectId]/_notes-stream/notes-chat.tsx` |
| PN | `src/app/(platform)/studioflow/projects/[projectId]/_notes-stream/project-notes.tsx` |
| A | `src/app/(platform)/studioflow/actions.ts` |
| W | `src/apps/studioflow/workspace/service.ts` |
| PH | `src/apps/studioflow/phases/service.ts` |
| S | `src/apps/studioflow/shared.ts` |
| NC | `src/app/(platform)/studioflow/_components/phase-note-composer.tsx` |
| PE | `src/apps/presentation/ui/presentation-editor.tsx` |
| PF | `src/apps/presentation/ui/slide-frame.tsx` |
| PS | `src/apps/presentation/service.ts` |
| PA | `src/apps/presentation/actions.ts` |
| PL | `src/apps/presentation/ui/presentation-board-list.tsx` |
| IW | `src/platform/ui_engine/patterns/image-workspace.tsx` |
| IG | `src/platform/ui_engine/patterns/image-gallery.tsx` |
| IA | `src/platform/ui_engine/patterns/image-adjust.ts` |
| IP | `src/platform/ui_engine/patterns/image-prepare.ts` |
| RE | `src/platform/ui_engine/patterns/rich-text-editor.tsx` |
| RI | `src/platform/ui_engine/patterns/rich-text-editor-impl.tsx` |
| FT | `src/platform/ui_engine/patterns/formatted-text.tsx` |

CONFIRMED = deterministic source trace and/or real-service probe demonstrates the behavior. PARTIAL = a subset exists or visual/touch claims remain unverified. NOT REPRODUCED = inspection disproves the alleged absence within the stated scope, not a blanket acceptance PASS. No authenticated browser/caret/physical-touch/screenshot acceptance was performed.

Six in-memory scenarios executed the real createWorkspaceService/createPresentationService with fake persistence/storage ports: official text changed; omitted links survived that edit; a later unversioned phase save overwrote a prior save; official record deletion succeeded; HT searched names rather than code prefixes; a read-only board request invoked updateMany. These are service reproductions, not real database race or browser tests. Reproduce with an authorized ACTIVE project/phase and a TEXT card marked workflow_record=true, then edit/delete through phaseNotes; for the read probe resolve a stored annotation's Schedule ID to no entry and count write calls.

### A. Notes integrity

| ID / status | Evidence and reproduction | Proposed outcome / limit |
| --- | --- | --- |
| A1 CONFIRMED | PH:325–338 creates official answers as cards; W:304–317 edits and W:355–365 hard-deletes without a workflow_record guard. Only origin/phase are locked (W:346,500). N:286–290 still offers Edit/Delete. W:316,361 audit metadata contains no prior body; PH:335,446 undo is not a content recovery store. Probes changed/deleted an official card. | Recommend immutable official body/assets and refusal of ordinary deletion on Notes and Board; retain existing organizational starring. G1 settles metadata/retention exceptions. No promise of recovering earlier lost content. |
| A2 CONFIRMED | N:16–34 omits version; N:230 and strict action A:378 send none; W:709 makes it optional; W:197 checks only supplied versions. W:312 protects overlapping database writes, not a later old-screen save. Sequential editor probe overwrote the first save. Board's existing stale test at service.integration.test.ts:3739 misses phase transport. | Require read version and preserve the edit-session base. Conflict keeps draft and offers explicit reload; never adopt a refreshed version for an old draft. Existing version column is enough. Cover flags/delete too. |
| A3 CONFIRMED | N:230 recomputes tags but omits itemEntryIds; W:269 returns for undefined. Removing @HT-01 retained its link in the probe. Post resolves items (N:446–457), edit does not. W:603 renders retained links. | Resolve the complete edited-body mention set once in app-owned logic, validate and save atomically with body/tags/version; [] clears links. Do not inadvertently erase deliberate Board explicit links. |
| A4 CONFIRMED filter; PARTIAL search | Fresh initial object resets All at N:109–112 and replaces the page. N:123–155 also sticks to bottom. A:397 refreshes after actions. N:38,115–121/A:413 have no chat text-search state to reproduce losing. | Retain chosen phase/tag/feedback/starred filter and appropriate scroll anchor; guard stale refresh/filter requests and pagination. Reset on actual project change. Add no search feature. |
| A5 CONFIRMED | W:629–641 includes null-phase cards; N:212 hides their actions and N:159 refuses them. A:378 requires phase. Alternate Board action A:452 refuses Board off. Existing General policy is W:156–181/S:83–129. | Notes transport for existing General edits reuses phaseWork + project document access, ACTIVE/unarchived rules. Derive canEditGeneral server-side. Do not bypass Board's gate or infer General rights from a writable phase. Creation via phase × is G3. |

### B. Mentions and composer

| ID / status | Evidence | Proposed outcome / limit |
| --- | --- | --- |
| B1 CONFIRMED bare @ hidden | N:421 returns []; N:481 renders nonempty lists only. A:418 already permits empty query; W:647 can return first ten for it. | Open immediately with loading then first ten project items, stable Schedule order; no recents tracking. |
| B2 CONFIRMED prefix gap | `src/apps/studioflow/domain/schedule.ts:289` needs digits to parse a code; W:646–648 searches product_name for HT instead of prefix. Probe confirms. Full HT1/HT-01 already works. | Match normalized partial code OR name, retain exact full-code behavior/project scope/final-active naming/ten-result bound. |
| B3 PARTIAL rows/placement | Header/chip/first selection/hover/pick exist (N:424–425,482–488). Name/location are one string; popup anchors composer-left, not caret. | Separate code/name/right-muted-location and caret anchor above editor, clamped to viewport with selected-row scrolling. Header PRODUCT SCHEDULE. G2 governs editor hooks. |
| B4 NOT REPRODUCED absent keyboard picks | N:474–478 already handles Up/Down, Enter/Tab, Esc. | Preserve; add editor/listbox active-descendant association, IME and empty/pending guards, focus retention. Browser behavior still pending. |
| B5 CONFIRMED silent empty/loading/error | N:414,423 silently returns on action error; async callbacks have no catch; N:481 hides zero results. | Explicit closed/loading/results/empty/error states for @/#, No item matches, safe error/retry, ignore stale responses after close/new query. Lookup failure must not silently lose a link on send/edit. |
| B6 CONFIRMED caret/highlight gap | N:402–405 matches serialized-text end, N:433 replaces suffix. RE:7–32 exposes no caret/token-range/decoration API. | Canonical domain-neutral editor hooks/transient marks under G2; replace the active token range, including in mid-text. No private duplicate editor/formatter. |
| B7 PARTIAL sent chips/card | N:324 uses FT plain inline formatting; FT:50–64 has no mentions. N:335–344 displays separate code/name links/native title to Schedule root. W:560–567,601–604 returns no entry ID/thumbnail in items. | Resolved inline dark @CODE chips preserving formatting; hover/focus card with signed thumbnail, CODE · Product Schedule, name/location, Open item → specific entry. Missing/deleted image/entry stays usable. G2 governs rendering extension. |
| B8 PARTIAL #/composer | Tags header exists (N:483), known/new tags/#feedback (413–419). Phase is Select/static chip without × (504–508); dashed + #feedback exists (509). NC:109/N:520 use rectangular attach/send buttons. Enter already sends, with Shift/list/IME rules (RI:96–110). | Preserve rules; round accessible attach/send controls; # loading/empty/error states. Phase × requires G3 before removal creates new General-note behavior. |

### C. Presentation

| ID / status | Evidence | Proposed outcome / limit |
| --- | --- | --- |
| C1 CONFIRMED no pin drag | PF:28–48 provides click only; PE:193 makes image ancestor draggable. Frame-relative percentages already exist (PF:17–25); PA:102–107/PS:415–418 already update coordinates. | Pointer capture/local preview/clamp 0–100 in full image frame; save once on release, cancel restores position. Suppress ancestor image drag and click-to-add after pin drag. Retain image swap/click-select/add; keyboard nudge if G4 approves. |
| C2 CONFIRMED unconfirmed destruction | PE:89–108 replaces via picker/drop; PS:364–370 deletes old image/pins and queues object cleanup. PE:140,217,228 delete board/slide/pin; PE:264 removes image immediately. Child cascades in prisma/schema/presentation.prisma. | Reuse useConfirm for every destructive intent with affected counts; cancel performs no write/upload. Empty-slot placement/swap need no destructive confirmation. Navigate only after successful board deletion. |
| C3 CONFIRMED read writes | PS:223–232 uses read access then annotation.updateMany; fake-port probe counts one write. presentation.integration.test.ts:71–73 expects that read-side repair. | Pure reads/project missing links as null; persistence cleanup stays explicit at PS:426–427, presentation/public/lifecycle.ts:8, A:835–843. Change test contract; no new cross-schema relation or cleanup hidden in viewing. |
| C4 PARTIAL polish; CONFIRMED silent action failures | Existing hints/selection/empty states at PE:176,187,224,254,268–274. Mixed English/Indonesian PE:132–140,168,225–229/PL:25–27. PE:116 ignores pin-add failure; PE:140 navigates after failed deletion; PL:19–22 drops create errors. | Approved label list, safe errors for every action, pending/read-only/selection hints. Retain editor structure/product terms; no new layouts, modes or presentation behavior. |

### D. Shared image tools

| ID / status | Evidence | Proposed outcome / limit |
| --- | --- | --- |
| D1 CONFIRMED wheel ignores cursor | IW:269–272 changes zoom only; IW:283 uses existing pan as transform origin. | Cursor-anchored, bounded zoom using the same transform as export; keep sliders. |
| D2 CONFIRMED no pinch | IW:133 stores one pointer; IW:238–267 lacks pointer-distance handling; 279 uses touch-none. | Two-pointer midpoint-anchored pinch, correct capture/cancel, no accidental stroke. |
| D3 PARTIAL pan; CONFIRMED preview/export mismatch | Pan exists (IW:238–257), displacement is viewport percentage, not actual crop overflow. IW:283 object-cover at zoom=1 remains centered regardless of pan; export IW:199–206 uses pan. For 1600×900 at 4:3/zoom 1 export x=0/400 at pan 0/100 while preview remains x=200. With no aspect, preview is 16:9 (279), export source aspect (197–204). | One geometry calculation for preview/export, direct source-space pan with bounds; preserve fixed and omitted aspect output contracts. This is correctness, beyond subjective feel. |
| D4 CONFIRMED reset absent; PARTIAL frame | Only zoom/focus sliders IW:287–289. Fixed viewport/border at 279–280, no explicit crop guide/fit/reset. | Visible fixed frame, Reset crop/Fit to declared crop viewport; no accidental letterbox/aspect change. |
| D5 PARTIAL scribble discovery | Tools become visible after choosing image (IW:277–307); default pen (140); visual active state (306), hint (323). Simple upload consumers use shrinkImageFile, so expose no scribbles. | Clear Pan/Draw grouping, pressed state, subtools and colors and availability hint. Recommend initial Pan under G4. No new drawing workflow in Notes/Ideas/Presentation simple uploads. |
| D6 CONFIRMED no undo stroke | Accumulates strokes IW:247,261–264; only Clear annotations IW:324. | Separate Undo last stroke and Clear annotations; preserve strokes on mode changes. Keep existing output/crop-space overlay bake (220); image-anchored editable-after-save drawings would be new behavior. |
| D7 NOT REPRODUCED missing gallery/compression foundations | IG:48 focus, IG:62–72 dialog/arrows/actions/missing image. IA:31–40/IP:35–55 shared bounded compression/cleanup/pass-through. | Preserve gallery sizes/index/actions and upload/quality/color limits; reuse, do not rewrite. |

### E. UI Engine compliance

| ID / status | Exact evidence and bounded response |
| --- | --- |
| E1 NOT REPRODUCED raw legacy class | No literal legacy ui-* class found in N/PN, Presentation UI or four image patterns. Semantic utilities and --ui-* custom properties are not legacy classes. |
| E2 CONFIRMED token/contrast bypass | PE:172 uses nonexistent --ui-ink/--ui-ink-tertiary with literal fallback colors; active glyph #24211e against dark #1c1a18 calculates **1.08:1**. PF:43 uses bg-neutral-200; PF:46 ring-white is theme-fixed. Use existing semantic tokens locally. |
| E3 CONFIRMED explicit hit areas <44px | N:368/498 star/reply cancel 24px; NC:102 attachment-remove 24px; N:486 option approximately 32px, N:354/509 topic/feedback chips smaller than 44. PE:128 pin 28px, 172 layout 40px, 237 fit 32px. IW:317 colors and IG:56 remove 24px. Shared Button defaults also 32/36px, compact24/28 (`tokens/tokens.css:145–146,177–178`): replacing with Button alone does not fix hit size. Enlarge local interaction area while retaining visual density; no global density change. |
| E4 PARTIAL focus/access | Global visible focus already exists at `src/platform/ui_engine/styles/base.css:18`. Missing local focus utility is not proof of missing focus. Actual gaps: PF:38 click-only image frame and IW:284 canvas have no equivalent focusable gesture surface; N:482–486 lacks editor active-descendant linkage. Browser clipping/focus review pending. Preserve keyboard crop controls, add pin nudge; complete keyboard drawing editor is outside scope. |
| E5 CONFIRMED calculated contrast; PARTIAL rendered review | Dark tertiary #8a837a on muted #2a2825 = **3.93:1**, below 4.5 for small normal text: selected suggestion detail N:486–488 and unavailable gallery tile IG:48,52. `tokens/tokens.css:199–210`; light tertiary/white=5.91:1. Use a stronger existing text token locally; verify rendered themes later. |
| E6 PARTIAL duplicate chrome | N:509 feedback, PE:169–172/236–237 selection controls, N:332 download recreate chrome covered by FilterChip/Button/buttonClasses (`primitives/actions.tsx:25,115`, `primitives/button-classes.ts:26,45`). Reuse where fitting; keep app-owned pin/glyph geometry. No duplicate full cropper/gallery found. A linked preview card needs interactive focus semantics, not a text-only Tooltip; any missing canonical overlay is G2. |

### Complete shared image consumer matrix

Search covered symbol references and image filenames across all src and tests/public exports. These are all production call sites; this matrix specifies required coverage, not a pre-implementation no-regression claim.

| Capability | Every direct consumer | Required regression |
| --- | --- | --- |
| ImageWorkspace | `src/app/(platform)/studioflow/projects/[projectId]/schedule/schedule-board.tsx:163` Schedule photo/change (4:5/JPEG/1600, initialFile, openOnMount, page paste); same file `:974` option photo and `:1270` new option photo; `src/app/(platform)/studioflow/projects/[projectId]/mom/[momId]/mom-editor.tsx:159` MOM (4:3/JPEG/1600) | All four call sites: existing picker/drop/paste, crop/export, callback/pending/error. Also public default no-aspect/PNG fixture. |
| ImageGallery | N:317 single fill/album+viewerActions; `src/app/(platform)/studioflow/projects/[projectId]/_workspace-canvas/card.tsx:344` fill+actions; `src/apps/ideas/ui/ideas-board.tsx:138` square full-width override | Single/5-image album +N, actual indices, previous/next, signed/missing URLs, actions/removal when supplied, focus return; preserve Ideas override. |
| shrinkImageFile / image-prepare | NC:29 Notes/client-answer upload; `src/app/(platform)/studioflow/projects/[projectId]/_workspace-canvas/card.tsx:66,86` intake/replacement; `src/apps/ideas/ui/ideas-board.tsx:22`; PE:31 | Exact existing file limits, small-file identity, large JPEG/PNG, transparency-white JPEG background, dimensions/errors/cleanup. No extra crop step. |
| image-adjust | IW:9,217,225 and IP:1,40 | Neutral colors, unsupported filter fallback, compression quality-before-size order, annotation colors untouched by photo filter. |
| Public exports/tests | `src/platform/ui_engine/patterns/index.tsx:10,11,17`; ui-engine.test.ts, patterns/image-adjust.test.ts, patterns/image-prepare.test.ts, `src/apps/studioflow/mom.contract.test.ts` | Stable public surface; update every consumer together if a shared API changes. |

## Locked Decisions

1. Run 1 documents only. Status stays DRAFT until Lead approval and the material gates below; no execution authority inferred from backlog.
2. No new dependency, schema/migration source, business module, permission, cross-module internals or legacy use. No remote operations. One local revision per coherent later slice.
3. Notes stay StudioFlow-owned; Board is a Developer switch, not a role permission. Presentation writes its own data and uses only StudioFlow public facts.
4. Reuse established project/PIC/security gates, version column, ActionResult safe errors, confirmation, formatting dialect, upload/cleanup contracts and print geometry. Manual feedback and official workflow records are distinct.

### NEEDS LEAD/OWNER DECISION

| Gate | Recommendation / alternatives | Dependency |
| --- | --- | --- |
| G1 official history | Recommend immutable official body/assets and ordinary-delete refusal, retaining starring and existing organizational metadata unless specified otherwise. Update contract §6.1 and intentional edit-allowed test. Explicitly preserve existing retention/admin-reset exceptions or specify changed rules. Editable history/soft delete/recovery UI needs separately approved schema/product scope and is forbidden here. Old lost content is not reconstructable from present audit metadata. | A |
| G2 canonical editor scope | RE lacks caret/range/decoration hooks, FT lacks inline-token rendering. Recommend Lead-owned domain-neutral optional hooks and a canonical interactive hover/focus card if no overlay fits. These files are outside the owner's grant limited to shared image tools. Lead must implement the prerequisite separately or obtain explicit bounded authority extension before Executor B. No app-private formatter/editor substitute. Enumerate all additional editor/formatter consumers before changing them. | Full B |
| G3 phase × | Removing a required phase creates a General note. Recommend keeping phase required until Lead/owner approves General creation, default/empty selection and image upload transport under existing document rights. A5 existing-General editing can proceed independently. No inert × or silent fallback phase. | B phase removal |
| G4 polish choices | Approve bounded copy list (recommend English to match Notes/Product Schedule), initial Pan (crop-first), pin nudge 1%, Shift 5%. No new drawing tools/recents/chat search or persistent editable scribbles. | B/C/D |

## Business Rules and Architecture Constraints

- **REUSE** shared safe errors, ActionResult, UI Engine Button/IconButton/FilterChip, useConfirm/overlays, RichTextEditor/FormattedText, file intake/gallery/compression/preparation.
- **EXTEND** existing StudioFlow note transport/resolution and shared image geometry/gestures. Keep code parsing/item resolution and authorization **APP-OWNED**.
- **EXTEND after G2 only** the canonical editor/formatter/interactive overlay through proven domain-neutral hooks. Platform must never import StudioFlow data/permissions. No speculative framework or registry.
- **PURGE** Presentation read-side mutation and silent action errors. No cross-schema FK, implicit cross-module writes or new background cleanup mechanism.
- This corrects existing module capabilities; no module manifest/version/install/enable permission change is part of R9.64.

## Backend Contract

### Ordered slice A — reliable Notes

One coherent implementation revision after G1. Files: W, A, N, PN; all phaseNoteAction/editPhaseNote/deletePhaseNote/setPhaseNoteFlags callers including dialogs/image actions; StudioFlow service/action/surface tests; approved contract amendment.

- Central services refuse G1-protected mutation/deletion before text/metadata/link changes or storage cleanup, for both Notes and Board. Check Board bulk delete for clear refusal and unintended partial deletion. Preserve established retention/override behavior unless G1 explicitly changes it.
- Require positive read-version for edit/flags/delete and update every caller. Include version in ChatNote, capture it on entering edit, never advance it under an old draft. Keep draft on WORKSPACE_CARD_STALE with explicit reload/retry and safe conflict copy.
- One app-owned body resolver derives complete normalized item set for phase/General chat edits; validate exact codes, same project, duplicates/limits and apply atomically with body/tags/version. [] clears removed mentions. Unmatched/ambiguous codes remain plain per existing send behavior; failed lookup keeps draft unsaved rather than silently losing a relation. Preserve deliberate Board explicit link-set semantics unless Lead approves a full consumer update.
- Add Notes transport for existing General-note mutations through the existing project gate; no fabricated phase or workspace-board gate bypass. Pass server-derived canEditGeneral. Keep phase-labelled writes under phase-specific rights.
- Refresh selected filtered data/cursor coherently; do not briefly display unfiltered initial notes. Guard stale filter/project requests; retain non-bottom reading anchor. Add no new search feature.

Tests to add: missing/stale transport version; sequential two-editor stale save; stale flags/delete; protected TEXT edit/delete and IMAGE/FILE deletion on both service doors with no object cleanup; manual feedback editable; remove/replace/duplicate/escaped/wrong-project mention sets and limits; Board explicit []/undefined semantics; General PIC/outsider/phase-only/closed/archived/Board-off cases; filter refresh and response ordering. Update the prior official-edit test only with approved G1.

### Ordered slice B — @/# and sent mentions

One independently useful interaction revision, after G2 prerequisites and G3 decision. Files: N/NC; W search/item view; A; existing Schedule targeting; e2e/notes-chat.spec.ts. Shared editor/formatter/overlay only by Lead or separate explicit grant, not current Executor authority.

- Empty query returns first 10 in stable Schedule order; partial normalized code OR name search retains exact full-code and final/active-option semantics. Expose entryId/name/location/code and signed thumbnail URL through app reads; link to that entry. No recency storage or long-lived URL persistence.
- Canonical optional editor hooks report caret token/range/coordinates and transient highlight, replace exactly that range, preserve Markdown/IME/list/Shift/Enter behavior for all other consumers. Notes supplies domain content/query policy.
- Open @/# popup immediately, above caret and within viewport; header, code/name/right location, initial highlight, scroll/keys/pointer/focus, loading/empty/error/retry. New query/close invalidates old responses. Lookup error prevents silent unresolved send/edit.
- Inline resolved @CODE chips preserve formatted text; hover/focus opens thumbnail, CODE · Product Schedule, name/location and reachable Open item →. Missing/deleted image/entry degrades safely. No raw HTML/private formatter.
- Retain reserved feedback/five-tag and existing reply/album/upload/PIC rules, polish round attach/send buttons. Phase × implementation follows G3; if G2/G3 is unresolved, this slice remains DRAFT rather than silently incomplete.

Tests: empty/prefix/exact/name/final-option/project scope; signed/missing image+ID; middle-text caret/punctuation/escaping/IME; stale result/Escape; Up/Down/Enter/Tab and focus; no results/error/retry; formatted chips/card link; # new/existing/feedback/limit; send/Shift/list Enter, attachments/album. G2 requires its separate complete shared-editor/formatter consumer matrix before implementation.

### Ordered slice C — Presentation pin movement and safe actions

One independent Presentation revision. Files: PE/PF/PL/PS; PA only for necessary bounded validation; presentation.integration.test.ts; e2e/presentation-upload.spec.ts and presentation-print.spec.ts; existing lifecycle/composition tests.

- Keep PF server-renderable for print. Editor callbacks capture full image-frame bounds including cropped overflow, preview/clamp percentages locally, save once on pointer release, revert on failure/cancel/lost capture. Suppress image-ancestor HTML drag and accidental select/add click after dragging pin. Current image selection/click-add/swap remains.
- Keyboard nudge through existing updateAnnotation and approved G4 steps; existing project/permission/archive gates and labels preserved.
- useConfirm for replace (picker/drop), remove image, delete pin/slide/board with actual affected counts. Cancel does not upload/write. Empty placement/swap is harmless. Pending prevents duplicates; failures surface and preserve state. Board navigation occurs only after successful deletion; board-create and pin-add errors visible.
- getBoard is read-only, projecting unresolved links null. Existing explicit public lifecycle cleanup after Schedule deletion remains the write path. Test it separately, not through getBoard. Failed best-effort cleanup may leave a harmless stale stored ID; do not add implicit viewing writes, background retry product behavior or cross-schema relations.
- Apply approved label list and existing semantic tokens to affected chrome, selected/empty/read-only hints. No slide/free-canvas/layout redesign.

Tests: partial coordinate update preserves note/item/side/order, boundary/project rights; missing-link/repeated reads with write delegates throwing; explicit lifecycle cleanup ownership; drag edges/capture/cancel/one-save/revert/nudge; click-add/select/image swap with pins; every confirm/cancel/error and deletion navigation; print coordinates/numbers/legend/six layouts.

### Ordered slice D — shared image geometry/gestures

One independent shared image revision with every affected consumer. Files: IW/IA/IP/IG only as needed, existing image/UI Engine tests and browser image fixtures. Keep helpers in existing image-pattern scope; no graphics framework or dependency.

- One crop calculation drives source rectangle and preview for landscape/portrait/square, fixed/omitted aspect; cursor wheel zoom, midpoint pinch, direct source-space pan with limits, clean capture/release/cancel. Preserve keyboard sliders and URL cleanup.
- Visible fixed-aspect guide plus Reset crop/Fit. For existing fixed-aspect callers Fit means minimum cover crop, preserving output aspect. Omitted aspect preserves original. Letterboxing/changed output policy needs a new decision.
- Clear Pan/Draw and active subtool states, distinct Undo last stroke/Clear annotations; mode switches preserve strokes. Keep existing crop/output-space stroke bake; new-file selection resets crop/strokes/colors. Disabled/pending prevents intake and gestures from changing a file mid-preparation.
- Preserve PNG/JPEG options, max/target bytes, quality/dimensions, transparency-white JPEG background, canvas-filter fallback, pass-through of small shrinkImageFile inputs, gallery sizes/indices/callbacks/consumer overrides and signed URLs.
- Local 44px hit regions/stronger text tokens on touched controls; no global density/token redesign. Do not expose scribbles in simple upload flows.

Tests: pure crop/cursor/midpoint invariants, bounds/zero overflow/min/max zoom; colored-quadrant pixel fixture proves preview/export match; pinch versus strokes/cancel, mode/undo/clear/new-file/pending; every matrix consumer's intake/callback/output; all gallery sizes/actions and compression error/size/fallback cases.

## UI Contract

Owner's temporary grant covers Notes, Presentation and shared image patterns, not unrelated shared editor code. Use semantic tokens/canonical components; retain compact visual composition while expanding local interactive hit areas to 44px. Safe loading/empty/error/focus states are required. Lead owns final visual acceptance and out-of-grant shared prerequisites.

## Boundaries and Non-goals

No Run 1 application changes; historical backfill, soft-delete/edit-history schema, new modules/permissions/dependencies; legacy; unrelated Board note-thread follow-up; person mentions/chat search/recents; image-anchored persistent scribble editing; simple-upload crop editor injection; new presentation layouts. Presentation numbered pins remain distinct from baked scribbles. No live Design canvas was attached/accessed: target visuals use the owner's written spec, with pixel/feel review deferred. No remote operation/publication. Preserve owner test files.

## Acceptance Criteria

1. Lead resolves G1–G4 and makes one vertical slice READY with next-unused revision; decisions are not implementation guesses.
2. A protects approved historical evidence, rejects stale mutations, synchronizes edited-body links, preserves reader/draft state and supports existing General edits under unchanged rights with Board off.
3. B meets bare @/#, filtering/states/caret/highlight/keys/pointer/inline card/composer requirements, with phase-removal decision explicit.
4. C moves pins without breaking image drag/click/print, confirms destruction, shows failures and makes reads pure.
5. D makes preview/output agree and gestures/undo understandable, with every consumer verified.
6. Only Reviewer records acceptance PASS after applicable browser scenarios. This docs commit closes no existing [BUG]/[PLANNED] item.

## Verification

Run 1 final checks: **npm test 1119/1119**, typecheck, full lint, architecture boundaries, legacy-runtime, production build PASS; focused existing image tests 8/8; six successful in-memory service scenarios; source/consumer scan and calculated contrast as above. Initial typecheck failed on stale generated Prisma definitions and passed after regeneration. Initial production invocation using Node --env-file failed worker startup; loading office variables in a wrapper and invoking Next normally passed. These recovered setup failures are not application fixes. Existing test success does not prove the proposed corrections.

Browser/e2e/rendered visual/touch/caret checks were not run: Run 1 changes docs only and deterministic traces/probes establish the functional findings. Visual or subjective claims are PARTIAL. No claim of manual acceptance. Build-generated next-env.d.ts route-import changes were restored to HEAD; no application source/test changed.

Later slice gates: npm test, typecheck, full lint, check:boundaries, check:legacy-runtime, production build, staged/unstaged whitespace. Set location/load ignored settings and guard explicit rebuild-only targets; synchronize already-committed migrations on every used local DB. Do not author new migration without separate owner approval. Read relevant installed Next.js docs before route/action implementation. Add proportionate focused tests listed above and screen-size e2e when layout/token changes actually occur. A skipped/unavailable/cancelled check is never a pass.

## Reviewer Acceptance

Five PENDING groups under R9.64/WO-SF-NOTES-PRESENTATION-IMAGE-01 are appended to docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md: A integrity/context/General rights; B mentions/card/composer; C pins/confirm/print; D crop/gestures/undo; E every image consumer/themes/access/viewports. They depend on future implementation; they are not acceptance of R9.63 or R9.64. Executor may diagnose implementation failures when required; only Reviewer records PASS.

## Regression Risks and Recovery

Distinguish manual feedback/official records; keep old draft version; preserve explicit Board links and phase/project rights; handle refresh/request races. Canonical editor changes risk every formatted consumer/IME, so G2 requires separate authority/matrix. Pin coordinates must stay image-relative through cover/contain/print and not compete with image drag. Destructive confirmation must include drop replacement. Read purity must not conceal implicit lifecycle writes. Image preview/output parity and all callbacks/byte limits/color/URL handling matter beyond visual polish; Ideas overrides are sensitive to shared CSS.

A, B, C and D are independently useful acceptance/revert boundaries; no preparatory placeholders. Each gets one next-unused revision; corrections use a new revision, never amend an accepted commit. Recovery is a reviewed local revert of that slice; reverting code cannot recover previously lost history. Baseline migrations applied for synchronization remain baseline, not an audit rollback target.

## Executor Prompt

```text
ROLE: BACKEND EXECUTOR, with only the owner's expressly expanded UI lane.
Location: kantor. Read AGENTS.md, docs/agent/EXECUTOR.md and PLAN.md
WO-SF-NOTES-PRESENTATION-IMAGE-01. R9.64 is a DRAFT audit/plan, not execution
authority. Start Run 2 only after the Lead's recorded OK/corrections and the
selected slice's material decisions are resolved; normally A first. Allocate
the next unused CHANGELOG revision. Shared editor/formatter/overlay work needs
a Lead-owned prerequisite or separate explicit grant. Preserve module/PIC
boundaries and owner test files; no new schema/migrations/dependencies, legacy
or remote operations. Finish the entire READY vertical slice, required tests
and checks, changelog and one local commit. Return only the Planner/Reviewer
prompt with outcome, commit, checks, limitations, pending browser groups and
complete remaining dirty files. Stop precisely for material contract conflict.
```
