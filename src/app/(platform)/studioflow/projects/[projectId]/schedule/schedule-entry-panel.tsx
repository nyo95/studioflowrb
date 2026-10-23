"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardPaste,
  History,
  ImageIcon,
  Package,
  Palette,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  SCHEDULE_CARD_FIELD_LABEL as CARD_FIELD_LABEL,
  SCHEDULE_EXTRA_LABEL_MAX,
  SCHEDULE_EXTRA_MAX,
  SCHEDULE_EXTRA_VALUE_MAX,
  brandLinkCandidates,
  SCHEDULE_SECTION_LABEL as SECTION_LABEL,
  finalOf,
  nextOptionLabel,
  shownOptionOf,
  templateSourceOf,
  type ScheduleEntryView,
  type ScheduleExtraField,
  type ScheduleOptionView,
} from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  ButtonMenu,
  CreatableSearch,
  ImageWorkspace,
  IconButton,
  InlineError,
  RowActionMenu,
  SimpleTextEditor,
  Text,
  useConfirm,
  useFileIntake,
  type CreatableSearchOption,
} from "@/platform/ui_engine";
import {
  cancelScheduleSampleAction,
  createScheduleOptionAction,
  deleteScheduleOptionAction,
  listScheduleBrandContactsAction,
  markScheduleFinalAction,
  removeScheduleOptionImageAction,
  receiveScheduleSampleAction,
  saveScheduleEntryAsTemplateAction,
  setScheduleOptionImageAction,
  updateScheduleEntryAction,
  unmarkScheduleFinalAction,
  updateScheduleOptionAction,
} from "../../../actions";
import { InlineReuse } from "./schedule-reuse";
import { type Brand, type Command, EMPTY_PRODUCT, InlinePhotoEditor, InlineSampleRequest, PHOTO_ASPECT, type ProductDraft, productFromOption, Thumb, toSnapshot } from "./schedule-shared";

// ── Entry drawer content ───────────────────────────────────────────────────────

/**
 * One local-draft editor for item fields, option specs and card visibility.
 * Several options may be edited before the explicit Save; the eye controls
 * presentation only and never gates or clears the corresponding value.
 */
export function EntryPanelContent({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  onClose,
  onDirtyChange,
  initialPhotoOptionId,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Set once, from the board card's photo click, to open the panel with
   * that option selected and its photo editor already active — this component owns
   * consuming it (a ref, not a prop echoed back) so a stale value can never
   * leak into a later, unrelated open of the same mounted panel. */
  initialPhotoOptionId?: string | null;
}) {
  const { run, isPending } = command;
  const [reuse, setReuse] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [photoInColor, setPhotoInColor] = useState(false);
  const [newPhotoOpen, setNewPhotoOpen] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [preparedNewPhoto, setPreparedNewPhoto] = useState<File | null>(null);
  const [sampleFor, setSampleFor] = useState<ScheduleOptionView | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const wanted = initialPhotoOptionId && entry.options.some((option) => option.id === initialPhotoOptionId) ? initialPhotoOptionId : null;
    return wanted ?? shownOptionOf(entry)?.id ?? null;
  });

  // Adjust-during-render, not useEffect: this fires once per fresh mount
  // (the panel fully unmounts on close, so the ref always starts at null),
  // and the ref guard keeps it from re-firing on every re-render.
  const normalizedInitialPhotoOptionId = initialPhotoOptionId ?? null;
  const autoPhotoAppliedRef = useRef<string | null>(null);
  if (autoPhotoAppliedRef.current !== normalizedInitialPhotoOptionId) {
    autoPhotoAppliedRef.current = normalizedInitialPhotoOptionId;
    if (normalizedInitialPhotoOptionId && entry.options.some((option) => option.id === normalizedInitialPhotoOptionId)) setPhotoFor(normalizedInitialPhotoOptionId);
  }

  const selected = selectedId === "new" ? null : entry.options.find((option) => option.id === selectedId) ?? shownOptionOf(entry);

  // Paste a photo like in Notes (owner, 2026-10-08): Ctrl+V anywhere outside a text field, or a drop on the photo box,
  // opens the photo editor with that image already in it.
  const [handedPhoto, setHandedPhoto] = useState<File | null>(null);
  const openPhoto = (optionId: string, file: File | null = null) => { setHandedPhoto(file); setPhotoFor(optionId); setReuse(false); setSampleFor(null); };
  const photoIntake = useFileIntake({
    accept: "image/*",
    disabled: !canEdit || !selected || photoFor !== null,
    pasteFromPage: true,
    onFiles: (files, refused) => { const file = files[0] ?? refused[0]; if (file && selected) openPhoto(selected.id, file); },
  });

  // Owner decision 2026-09-24: nothing auto-saves per field. `baseline` is what is persisted for the item-level
  // pieces; `optionBaseline` holds what was last saved per option (props catch up after the refresh);
  // `drafts` holds only the options the person has touched.
  const [baseline, setBaseline] = useState(() => ({ fields: { qty: entry.qty ?? "", unit: entry.unit ?? "", location: entry.location ?? "" } }));
  const [fields, setFields] = useState(baseline.fields);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [optionBaseline, setOptionBaseline] = useState<Record<string, ProductDraft>>({});

  const baselineOfOption = (option: ScheduleOptionView | null): ProductDraft => (option ? optionBaseline[option.id] ?? productFromOption(option) : EMPTY_PRODUCT);
  const draftKey = selectedId === "new" ? "new" : selected?.id ?? "new";
  const draft = drafts[draftKey] ?? baselineOfOption(selected);
  const updateDraft = (patch: Partial<ProductDraft>) => setDrafts((current) => ({ ...current, [draftKey]: { ...(current[draftKey] ?? baselineOfOption(selected)), ...patch } }));
  const dirtyOptionKeys = Object.keys(drafts).filter((key) => {
    const option = entry.options.find((row) => row.id === key) ?? null;
    if (key !== "new" && !option) return false; // the option was deleted meanwhile
    return JSON.stringify(drafts[key]) !== JSON.stringify(baselineOfOption(option));
  });
  const fieldsChanged = fields.qty !== baseline.fields.qty || fields.unit !== baseline.fields.unit || fields.location !== baseline.fields.location;
  const isDirty = dirtyOptionKeys.length > 0 || fieldsChanged || preparedNewPhoto !== null;
  // Tell the dialog wrapper whether it's safe to close without confirming —
  // a ref write in the parent, not a state update.
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  // Every option needs a Type before it can be saved.
  const optionNeedsType = dirtyOptionKeys.some((key) => !drafts[key].productName.trim()) || Boolean(preparedNewPhoto && !drafts.new?.productName.trim());

  const entryFieldsKey = `${entry.id}-fields`;
  const optionFieldsKey = `${entry.id}-option-fields`;
  const newPhotoKey = `${entry.id}-new-option-photo`;
  const savePending = isPending(entryFieldsKey) || isPending(optionFieldsKey) || isPending(newPhotoKey);

  const saveAll = async () => {
    setSaveError(null);
    if (optionNeedsType) return;
    for (const key of dirtyOptionKeys) {
      const snapshot = toSnapshot(drafts[key]);
      let createdOptionId: string | null = null;
      const ok = await run(optionFieldsKey, () => key === "new"
        ? createScheduleOptionAction({ projectId, entryId: entry.id, snapshot })
        : updateScheduleOptionAction({ projectId, optionId: key, snapshot }), (data) => {
          if (key === "new" && data && typeof data === "object" && "optionId" in data && typeof data.optionId === "string") createdOptionId = data.optionId;
        });
      if (!ok) return;
      if (key === "new" && preparedNewPhoto && createdOptionId) {
        const form = new FormData(); form.set("projectId", projectId); form.set("optionId", createdOptionId); form.set("file", preparedNewPhoto);
        const photoOk = await run(newPhotoKey, () => setScheduleOptionImageAction(form));
        if (!photoOk) return;
        setPreparedNewPhoto(null);
      }
      setOptionBaseline((current) => ({ ...current, [key]: drafts[key] }));
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      // Show the option just added, not an empty "new option" form that reads as if it vanished.
      if (key === "new" && createdOptionId) setSelectedId(createdOptionId);
    }
    if (fieldsChanged) {
      const ok = await run(entryFieldsKey, () => updateScheduleEntryAction({
        projectId, entryId: entry.id,
        qty: fields.qty.trim() || null, unit: fields.unit.trim() || null, location: fields.location.trim() || null,
      }));
      if (!ok) return;
    }
    setBaseline({ fields });
  };
  const discardDraft = () => {
    setFields(baseline.fields);
    setDrafts({});
    setPreparedNewPhoto(null);
    setSaveError(null);
  };

  const brandOptions = selected?.brandId && !brands.some((b) => b.id === selected.brandId)
    ? [{ id: selected.brandId, name: selected.brandName ?? "Brand" }, ...brands]
    : brands;
  // One combobox instead of a select-plus-fallback-input pair: search Master
  // Data, or type a name that is not in it — no Master Data write happens
  // either way (StudioFlow never writes Master Data; brand text with no
  // catalogued id is the documented, ordinary case, §11.3).
  const isKnownBrandId = (id: string) => brandOptions.some((b) => b.id === id);
  const brandSearchOptions: CreatableSearchOption[] = [
    ...brandOptions.map((b) => ({ id: b.id, label: b.name })),
    ...(!draft.brandId && draft.brandName.trim()
      ? [{ id: draft.brandName, label: draft.brandName, description: "Typed — not in Master Data" }]
      : []),
  ];
  const handleBrandChange = (next: string) => {
    updateDraft(isKnownBrandId(next) ? { brandId: next, brandName: "" } : { brandId: "", brandName: next });
  };

  // A typed Brand that now exists in Master Data is offered as a link, never switched on its own (WO-SF-SCHEDULE-BRAND-LINK-01).
  const linkCandidates = draft.brandId ? [] : brandLinkCandidates(draft.brandName, brands);

  // The chosen Master Data Brand's contacts, offered as "Name (Title) - phone" (WO-SF-SCHEDULE-CONTACT-MD-01).
  // Picking one copies its text; anything typed is kept as typed, and nothing is filled in on its own.
  const [brandContacts, setBrandContacts] = useState<{ brandId: string; options: CreatableSearchOption[] } | null>(null);
  useEffect(() => {
    const brandId = draft.brandId;
    if (!brandId) return;
    let cancelled = false;
    void listScheduleBrandContactsAction({ projectId, brandId }).then((result) => {
      if (cancelled || !result.ok) return;
      setBrandContacts({ brandId, options: result.data.map((contact) => ({ id: contact.label, label: contact.label, description: contact.vendorName })) });
    });
    return () => { cancelled = true; };
  }, [projectId, draft.brandId]);
  const fromMasterData = brandContacts && brandContacts.brandId === draft.brandId ? brandContacts.options : [];
  // A typed contact (or one saved earlier) is shown as its own choice, the way a typed Brand is.
  const contactOptions: CreatableSearchOption[] = draft.contact && !fromMasterData.some((option) => option.id === draft.contact)
    ? [{ id: draft.contact, label: draft.contact }, ...fromMasterData]
    : fromMasterData;

  const removePhoto = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Remove the photo of option ${option.label}?`,
      description: "The option keeps its product details.",
      confirmLabel: "Remove photo",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => removeScheduleOptionImageAction({ projectId, optionId: option.id }));
  };

  const cancelSample = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: "Cancel this sample request?",
      description: `${option.sampleRequest?.requestedFrom || "Master Data"} will not be asked further. This cannot be undone.`,
      confirmLabel: "Cancel request",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => cancelScheduleSampleAction({ projectId, requestId: option.sampleRequest!.id }));
  };

  const removeOption = async (option: ScheduleOptionView) => {
    const ok = await confirm({
      title: `Delete option ${option.label}?`,
      description: option.isFinal ? "This is the final option. The item goes back to needing a decision; no other option becomes final by itself." : "The option is removed from this item.",
      confirmLabel: "Delete option",
      tone: "danger",
    });
    if (ok) await run(`${entry.id}-opt-${option.id}`, () => deleteScheduleOptionAction({ projectId, optionId: option.id }));
  };

  // The panel only records data; which fields a card shows is chosen on the Board, the pre-print view (owner, 2026-10-23).
  const disabled = !canEdit || savePending;
  const busyKey = selected ? `${entry.id}-opt-${selected.id}` : "";
  const isNew = selectedId === "new";
  const startNewOption = () => { setSelectedId("new"); setDrafts((current) => ({ ...current, new: current.new ?? EMPTY_PRODUCT })); setReuse(false); setPhotoFor(null); setSampleFor(null); setNewPhotoOpen(false); };
  const startReuse = () => { setReuse(true); setPhotoFor(null); setSampleFor(null); };
  const pickOption = (id: string) => { setSelectedId(id); setReuse(false); setPhotoFor(null); setSampleFor(null); setPhotoInColor(false); };

  // The photo opens a choice (owner 2026-10-23: "Change photo" must not jump straight to the file dialog when a colour is also possible).
  const pasteFromClipboard = async (optionId: string) => {
    setPasteHint(null);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (type) { const blob = await item.getType(type); openPhoto(optionId, new File([blob], "pasted-image", { type })); return; }
      }
      setPasteHint("No image on the clipboard. Copy one, then press Ctrl+V here.");
    } catch {
      setPasteHint("The browser did not allow reading the clipboard. Press Ctrl+V here instead.");
    }
  };
  const photoMenu = (option: ScheduleOptionView) => [
    { label: "Upload a photo…", icon: <Upload aria-hidden="true" />, onSelect: () => { setPhotoInColor(false); openPhoto(option.id); } },
    { label: "Paste from clipboard", icon: <ClipboardPaste aria-hidden="true" />, onSelect: () => void pasteFromClipboard(option.id) },
    { label: "Use a colour", icon: <Palette aria-hidden="true" />, onSelect: () => { setPhotoInColor(true); openPhoto(option.id); } },
    ...(option.imageUrl ? [{ label: "Remove photo", danger: true, separatorBefore: true, onSelect: () => void removePhoto(option) }] : []),
  ];

  const sample = selected?.sampleRequest ?? null;
  const sampleText = !sample ? "No sample requested"
    : sample.status === "REQUESTED" ? `Sample asked${sample.requestedFrom ? ` from ${sample.requestedFrom}` : ", supplier to be found"}`
    : sample.status === "RECEIVED" ? `Sample received${sample.receivedNote ? `: ${sample.receivedNote}` : ""}`
    : `Sample declined${sample.declineReason ? `: ${sample.declineReason}` : ""}`;

  const specRows: Array<{ key: string; label: string; value: string; placeholder: string; maxLength: number; onChange: (value: string) => void }> = [
    { key: "color", label: CARD_FIELD_LABEL.color, value: draft.color, placeholder: "Add", maxLength: 160, onChange: (value) => updateDraft({ color: value }) },
    { key: "pattern", label: CARD_FIELD_LABEL.pattern, value: draft.pattern, placeholder: "Add", maxLength: 160, onChange: (value) => updateDraft({ pattern: value }) },
    { key: "finishing", label: CARD_FIELD_LABEL.finishing, value: draft.finishing, placeholder: "Add", maxLength: 160, onChange: (value) => updateDraft({ finishing: value }) },
    { key: "dimension", label: "Size", value: draft.dimension, placeholder: "e.g. 60 × 60 cm", maxLength: 160, onChange: (value) => updateDraft({ dimension: value }) },
  ];
  const ROW = "flex min-h-9 items-center gap-2 border-t border-line-subtle";
  const ROW_LABEL = "w-20 shrink-0 text-xs text-ink-secondary";
  const ROW_INPUT = "h-8 min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:outline-none disabled:opacity-70";

  // Item-level rows: they belong to the code, not to an option, so they show even before the first option exists.
  const itemRows = (
    <>
      <label className={ROW}>
        <span className={ROW_LABEL}>Location</span>
        <input value={fields.location} onChange={(event) => setFields({ ...fields, location: event.target.value })} disabled={disabled} maxLength={160} placeholder="Where it goes" className={ROW_INPUT} />
      </label>
      {/* Qty only for Fixture — a Material line is specified, not counted (owner decision 2026-09-23). */}
      {entry.section === "FIXTURE" ? (
        <div className={ROW}>
          <span className={ROW_LABEL}>Qty</span>
          <input aria-label="Qty" inputMode="decimal" value={fields.qty} onChange={(event) => setFields({ ...fields, qty: event.target.value })} disabled={disabled} maxLength={20} placeholder="0" className={`${ROW_INPUT} !flex-none w-20`} />
          <input aria-label="Unit" value={fields.unit} onChange={(event) => setFields({ ...fields, unit: event.target.value })} disabled={disabled} maxLength={40} placeholder="Unit" className={ROW_INPUT} />
        </div>
      ) : null}
    </>
  );

  const hero = (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3.5">
      {/* The photo fills the height of the fields beside it (never shorter than 4:5), so no empty band opens under it. */}
      <div className="relative">
        {isNew ? (
          <button type="button" onClick={() => setNewPhotoOpen((value) => !value)} aria-expanded={newPhotoOpen} className="grid h-full min-h-35 w-full place-content-center justify-items-center gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted text-xs text-ink-secondary hover:border-line-focus">
            {preparedNewPhoto ? <Check aria-hidden="true" className="h-5 w-5 text-success" /> : <ImageIcon aria-hidden="true" className="h-5 w-5" />}
            {preparedNewPhoto ? "Photo ready" : "Add photo"}
          </button>
        ) : selected && canEdit ? (
          <RowActionMenu
            align="start"
            items={photoMenu(selected)}
            trigger={
              <button type="button" {...photoIntake.target} aria-label={`Photo of option ${selected.label}`} title="Choose a photo or a colour, or drop / paste one (Ctrl+V)" className={`relative block h-full w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus ${photoIntake.active ? "outline-2 outline-dashed outline-offset-2 outline-line-focus" : ""}`}>
                <Thumb url={selected.imageUrl} alt={selected.productName} className="!h-full min-h-35 w-full !rounded-control" />
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-ink">{selected.imageUrl ? "Photo" : "Add photo"}<ChevronDown aria-hidden="true" className="h-3 w-3" /></span>
              </button>
            }
          />
        ) : (
          <Thumb url={selected?.imageUrl ?? null} alt={selected?.productName ?? "No photo"} className="!h-full min-h-35 w-full !rounded-control" />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">Type</span>
          <input
            aria-label="Type"
            value={draft.productName}
            onChange={(event) => updateDraft({ productName: event.target.value })}
            disabled={disabled}
            maxLength={200}
            placeholder="e.g. Nude Pro - ATS 1132 M"
            className="-ml-1.5 h-9 w-[calc(100%+0.375rem)] rounded-[6px] border border-transparent bg-transparent px-1.5 text-base font-semibold leading-tight text-ink placeholder:text-sm placeholder:font-normal placeholder:text-ink-tertiary hover:border-line-subtle focus:border-line-focus focus:bg-surface focus:outline-none"
          />
        </label>
        <div className="grid gap-0.5">
          <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">Brand</span>
          <CreatableSearch
            label="Brand"
            options={brandSearchOptions}
            value={draft.brandId || draft.brandName}
            onValueChange={handleBrandChange}
            onCreate={(text) => text}
            createLabel={(text) => `Use "${text}" (not in Master Data)`}
            placeholder="Search or type a brand"
            searchPlaceholder="Search brands…"
            emptyLabel="No brands found"
            allowClear
            disabled={disabled}
            className="-ml-1.5 w-[calc(100%+0.375rem)] min-w-0 !h-8 !min-h-8 !border-transparent !bg-transparent !px-1.5 !text-sm"
          />
          {linkCandidates.length && !disabled ? (
            <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-tertiary">
              Not in Master Data ·
              {linkCandidates.map((brand) => (
                <button key={brand.id} type="button" onClick={() => updateDraft({ brandId: brand.id, brandName: "" })} className="font-medium text-ink underline underline-offset-2 hover:text-ink-secondary">
                  Link to &ldquo;{brand.name}&rdquo;
                </button>
              ))}
            </span>
          ) : null}
        </div>
        {/* Where the product is bought; internal, so it is never on the card or in print. */}
        <div className="grid gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">Contact</span>
          <CreatableSearch
            label="Contact"
            options={contactOptions}
            value={draft.contact}
            onValueChange={(next) => updateDraft({ contact: next.slice(0, 160) })}
            onCreate={(text) => text}
            createLabel={(text) => `Use "${text}"`}
            placeholder={fromMasterData.length ? "Choose a contact or type one" : "Name (Title) - phone"}
            searchPlaceholder="Search or type a contact…"
            emptyLabel={draft.brandId ? "No contacts for this Brand in Master Data" : "Type a contact"}
            allowClear
            disabled={disabled}
            className="-ml-1.5 w-[calc(100%+0.375rem)] min-w-0 !h-8 !min-h-8 !border-transparent !bg-transparent !px-1.5 !text-sm"
          />
        </div>
        <div className="mt-auto pt-1">
          {!isNew && selected?.isFinal ? (
            <div className="flex min-h-8 items-center gap-2 rounded-action bg-success-surface px-2.5 text-sm font-semibold text-success">
              <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
              <span className="mr-auto">Chosen as final</span>
              {canEdit ? <button type="button" disabled={isPending(busyKey)} onClick={() => void run(busyKey, () => unmarkScheduleFinalAction({ projectId, optionId: selected.id }))} className="text-xs font-medium underline underline-offset-2 disabled:opacity-50">Undo</button> : null}
            </div>
          ) : !isNew && selected && canEdit ? (
            <Button size="sm" variant="primary" className="w-full" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => markScheduleFinalAction({ projectId, optionId: selected.id }))}>Set option {selected.label} as final</Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Option strip: same-size tabs, one + for every way to add; it stays put while the details scroll. */}
      {entry.options.length || isNew ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line-subtle bg-surface-raised px-4 py-2.5" role="group" aria-label="Spec options">
          {entry.options.map((option) => {
            const active = !isNew && option.id === selected?.id;
            return (
              <button key={option.id} type="button" aria-pressed={active} title={`Option ${option.label}: ${option.productName}${option.isFinal ? " (final)" : option.status === "NOT_USED" ? " (not used)" : ""}`} onClick={() => pickOption(option.id)} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-action border bg-surface pl-1 pr-2.5 text-sm text-ink ${active ? "border-line-focus font-bold shadow-[inset_0_0_0_1px_var(--ui-border-focus)]" : "border-line font-medium hover:border-line-strong"} ${option.status === "NOT_USED" ? "opacity-60" : ""}`}>
                <Thumb url={option.imageUrl} alt="" className="h-7 w-[1.375rem] !rounded-[5px]" />
                {option.label}
                {option.isFinal ? <Check aria-label="Final" className="h-3.5 w-3.5 text-success" strokeWidth={3} /> : null}
              </button>
            );
          })}
          {isNew ? <span className="inline-flex h-9 shrink-0 items-center rounded-action border border-line-focus bg-surface px-2.5 text-sm font-bold shadow-[inset_0_0_0_1px_var(--ui-border-focus)]">{nextOptionLabel(entry.options.map((option) => option.label))} · new</span> : null}
          {canEdit ? <ButtonMenu label="Option" variant="secondary" align="start" leadingIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />} items={[
            { label: `Blank option ${nextOptionLabel(entry.options.map((option) => option.label))}`, onSelect: startNewOption },
            { label: "Copy from a past project…", onSelect: startReuse },
          ]} /> : null}
          <span className="ml-auto" />
          {canEdit && selected && !isNew ? (
            <RowActionMenu
              label={`Option ${selected.label} actions`}
              pending={isPending(busyKey)}
              items={[
                ...(sample?.status === "REQUESTED" ? [{ label: "Cancel sample request", danger: true, onSelect: () => void cancelSample(selected) }] : []),
                { label: `Delete option ${selected.label}`, danger: true, separatorBefore: sample?.status === "REQUESTED", onSelect: () => void removeOption(selected) },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      <div className={`grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 pt-4 ${canEdit ? "pb-4" : "pb-6"}`}>
        {reuse ? <InlineReuse projectId={projectId} entry={entry} command={command} onClose={() => setReuse(false)} /> : null}

        {entry.options.length === 0 && !isNew ? (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Text weight="semibold">This code is reserved, no product yet</Text>
              <Text size="sm" tone="secondary">Start option A here, or copy a product used in a past project.</Text>
            </div>
            {canEdit ? (
              <div className="grid gap-2">
                <Button variant="primary" className="justify-start" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={startNewOption}>Add option A</Button>
                <Button variant="secondary" className="justify-start" leadingIcon={<History className="h-3.5 w-3.5" />} onClick={startReuse}>Copy from a past project</Button>
              </div>
            ) : null}
            <div className="grid">{itemRows}</div>
          </div>
        ) : (
          <>
            {photoFor && entry.options.some((option) => option.id === photoFor) ? (
              <InlinePhotoEditor projectId={projectId} entryCode={entry.code} option={entry.options.find((option) => option.id === photoFor)!} command={command} initialFile={handedPhoto} startInColor={photoInColor} onClose={() => { setPhotoFor(null); setHandedPhoto(null); setPhotoInColor(false); }} />
            ) : hero}
            {pasteHint ? <Text size="sm" tone="secondary" role="status">{pasteHint}</Text> : null}
            {isNew && newPhotoOpen && canEdit ? (
              <div className="grid gap-1"><ImageWorkspace label="New option photo" aspect={PHOTO_ASPECT} maxDimension={1600} outputType="image/jpeg" allowColor onPrepared={(file) => { setPreparedNewPhoto(file); setNewPhotoOpen(false); }} disabled={savePending} pasteFromPage /></div>
            ) : null}

            {/* Sample: one quiet line, always in the same place. */}
            {!isNew && selected ? (
              <div className="grid gap-2">
                <div className="flex min-h-10 items-center gap-2.5 rounded-control border border-line-subtle bg-surface-raised py-1 pl-3 pr-1">
                  <Package aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-secondary" />
                  <Text size="sm" tone="secondary" className="mr-auto min-w-0 truncate" title={sampleText}>{sampleText}</Text>
                  {canEdit ? (
                    sample?.status === "REQUESTED"
                      ? <Button size="sm" variant="ghost" pending={isPending(busyKey)} onClick={() => void run(busyKey, () => receiveScheduleSampleAction({ projectId, requestId: sample.id }))}>Mark received</Button>
                      : <Button size="sm" variant="ghost" onClick={() => { setSampleFor(selected); setPhotoFor(null); setReuse(false); }}>{sample ? "Ask again" : "Request"}</Button>
                  ) : null}
                </div>
                {sampleFor ? <InlineSampleRequest projectId={projectId} option={sampleFor} command={command} onClose={() => setSampleFor(null)} /> : null}
              </div>
            ) : null}

            {/* Specs: one column of rows. */}
            <div className="grid">
              <div className="pb-1.5">
                <Text size="sm" weight="semibold">Specs</Text>
              </div>
              {specRows.map((row) => (
                <label key={row.key} className={ROW}>
                  <span className={ROW_LABEL}>{row.label}</span>
                  <input value={row.value} onChange={(event) => row.onChange(event.target.value)} disabled={disabled} maxLength={row.maxLength} placeholder={row.placeholder} className={ROW_INPUT} />
                </label>
              ))}
              {itemRows}
              {draft.extra.map((extra, index) => {
                const setExtra = (patch: Partial<ScheduleExtraField>) => updateDraft({ extra: draft.extra.map((field, position) => (position === index ? { ...field, ...patch } : field)) });
                return (
                  <div key={index} className={ROW}>
                    <input aria-label={`Spec label ${index + 1}`} value={extra.label} onChange={(event) => setExtra({ label: event.target.value })} disabled={disabled} maxLength={SCHEDULE_EXTRA_LABEL_MAX} placeholder="Label" className={`${ROW_INPUT} !flex-none w-20 !px-0 text-xs !text-ink-secondary`} />
                    <input aria-label={extra.label || `Spec value ${index + 1}`} value={extra.value} onChange={(event) => setExtra({ value: event.target.value })} disabled={disabled} maxLength={SCHEDULE_EXTRA_VALUE_MAX} placeholder="Value" className={ROW_INPUT} />
                    <IconButton size="sm" variant="ghost" label={`Remove ${extra.label || `spec ${index + 1}`}`} icon={<X aria-hidden="true" />} disabled={disabled} onClick={() => updateDraft({ extra: draft.extra.filter((_, position) => position !== index) })} className="!h-7 !min-h-7 !w-7" />
                  </div>
                );
              })}
              {canEdit ? (
                <Button size="sm" variant="ghost" className="mt-1 justify-self-start" leadingIcon={<Plus className="h-3.5 w-3.5" />} disabled={disabled || draft.extra.length >= SCHEDULE_EXTRA_MAX} onClick={() => updateDraft({ extra: [...draft.extra, { label: "", value: "" }] })}>Add a spec line</Button>
              ) : null}
            </div>

            <div className="grid gap-1">
              <Text size="sm" weight="semibold">Notes</Text>
              <SimpleTextEditor value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} disabled={disabled} maxLength={2000} rows={2} />
            </div>
          </>
        )}

        {optionNeedsType ? <InlineError>Enter a Type before saving product details.</InlineError> : null}
        {saveError ? <InlineError>{saveError}</InlineError> : null}
        {command.error && !reuse && !photoFor && !sampleFor ? <InlineError>{command.error}</InlineError> : null}
      </div>

      {canEdit ? (
        <div className={`flex shrink-0 items-center gap-2 border-t border-line-subtle px-4 py-2.5 ${isDirty ? "bg-surface-raised" : "bg-surface"}`}>
          <Text size="sm" tone="secondary" className="mr-auto" role="status">{isDirty ? "Unsaved changes" : "No changes"}</Text>
          <Button type="button" variant="ghost" disabled={!isDirty || savePending} onClick={discardDraft}>Discard</Button>
          <Button type="button" variant="primary" pending={savePending} disabled={!isDirty || optionNeedsType} onClick={() => void saveAll().catch((error) => setSaveError(error instanceof Error ? error.message : "Could not save."))}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Entry drawer ───────────────────────────────────────────────────────────────

/**
 * The one item editor (WO-SF-SCHED-RELAYOUT-01; docked, owner 2026-10-22): a pane fixed beside the board instead of a pop-up, so the board stays in view and clickable, with
 * previous/next across the current section and filter, and the item menu (move, save as template, delete).
 */
export function DockedEntryPanel({
  projectId,
  entry,
  brands,
  canEdit,
  command,
  confirm,
  canManageTemplates,
  categories,
  previousId,
  nextId,
  onNavigate,
  onMove,
  onDelete,
  onClose,
  onDirtyChange,
  initialPhotoOptionId,
}: {
  projectId: string;
  entry: ScheduleEntryView;
  brands: readonly Brand[];
  canEdit: boolean;
  command: Command;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  canManageTemplates: boolean;
  categories: string[];
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  initialPhotoOptionId?: string | null;
}) {
  const state = finalOf(entry) ? "Final" : entry.options.length ? "Needs a decision" : "No product yet";
  const source = templateSourceOf(entry);
  return (
    <>
      <header className="grid shrink-0 gap-0.5 border-b border-line-subtle py-2.5 pl-4 pr-2">
        <div className="flex min-w-0 items-center gap-0.5">
          <h2 className="m-0 mr-auto min-w-0 truncate text-base font-semibold text-ink"><span className="font-ui-mono">{entry.code}</span> <span className="text-ink-secondary">· {entry.category}</span></h2>
          <IconButton size="sm" variant="ghost" label="Previous item" icon={<ArrowLeft aria-hidden="true" />} disabled={!previousId} onClick={() => { if (previousId) onNavigate(previousId); }} />
          <IconButton size="sm" variant="ghost" label="Next item" icon={<ArrowRight aria-hidden="true" />} disabled={!nextId} onClick={() => { if (nextId) onNavigate(nextId); }} />
          <RowActionMenu label={`Actions for ${entry.code}`} items={[
            { label: "Move to category…", disabled: categories.length < 2, onSelect: onMove },
            ...(canManageTemplates && source ? [{ label: "Save as template item", onSelect: () => { void command.run(`${entry.id}-template`, () => saveScheduleEntryAsTemplateAction({ projectId, entryId: entry.id })); } }] : []),
            { label: "Delete", danger: true, separatorBefore: true, onSelect: onDelete },
          ]} />
          <IconButton size="sm" variant="ghost" label="Close editor" icon={<X aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={finalOf(entry) ? "success" : entry.options.length ? "warning" : "neutral"}>{state}</Badge>
          <Text size="sm" tone="tertiary">{SECTION_LABEL[entry.section]}</Text>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <EntryPanelContent
          projectId={projectId}
          entry={entry}
          brands={brands}
          canEdit={canEdit}
          command={command}
          confirm={confirm}
          onClose={onClose}
          onDirtyChange={onDirtyChange}
          initialPhotoOptionId={initialPhotoOptionId}
        />
      </div>
    </>
  );
}
