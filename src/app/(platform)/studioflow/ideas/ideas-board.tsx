"use client";

import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Badge, Button, Dialog, EmptyState, Field, FormActions, ImageGallery, InlineError, Input, Notice, PillTabs, RadioGroup, RowActionMenu, Select, Text, Textarea, buttonClasses, shrinkImageFile, useConfirm, useFileIntake } from "@/platform/ui_engine";

import { createIdeaCardAction, ideaCardAction, listIdeaCategoryChoicesAction, listIdeaTargetEntriesAction, replaceIdeaImageAction, applyIdeaToScheduleAction, type IdeaCardView } from "./actions";

/** Mirrors the server limits (WO-SF-IDEAS-01); the server stays the authority. */
const IMAGE_BYTES = 3 * 1024 * 1024;
const ACCEPTED = "image/png,image/jpeg,image/webp";

type Target = { id: string; name: string };
type View = "all" | "unused" | "used";

async function upload(file: File, extra: Record<string, string> = {}) {
  const prepared = await shrinkImageFile(file, { maxBytes: IMAGE_BYTES });
  const form = new FormData();
  form.set("file", prepared);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * The board (owner, 2026-10-08): capture first, structure later. Paste, drop or pick any image and it is a card
 * at once; title, link and note are optional. "Use in schedule" copies the card into one project's schedule.
 */
export function IdeasBoard({ cards, targets }: { cards: IdeaCardView[]; targets: Target[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const picker = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [view, setView] = useState<View>("all");
  const [editing, setEditing] = useState<IdeaCardView | null>(null);
  const [using, setUsing] = useState<IdeaCardView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const add = async (files: File[], refused: File[] = []) => {
    const found = refused.length ? ["Only PNG, JPEG or WebP images can be added."] : [];
    setProblems(found);
    if (files.length === 0) return;
    setAdding(files.length);
    for (const file of files) {
      try {
        const result = await createIdeaCardAction(await upload(file));
        if (!result.ok) found.push(result.error.safeMessage);
      } catch {
        found.push(`${file.name || "An image"} could not be added.`);
      }
      setAdding((count) => count - 1);
    }
    setProblems([...found]);
    router.refresh();
  };
  // Paste works anywhere on the page outside a text field, and a drop anywhere on the board.
  const intake = useFileIntake({ accept: ACCEPTED, multiple: true, pasteFromPage: !editing && !using, disabled: Boolean(editing || using), onFiles: (files, refused) => void add(files, refused) });

  const shown = useMemo(() => cards.filter((card) => view === "all" || (view === "used" ? card.usages.length > 0 : card.usages.length === 0)), [cards, view]);
  const usedCount = cards.filter((card) => card.usages.length > 0).length;

  const replaceImage = (card: IdeaCardView) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(card.id); setRowError(null);
      try {
        const result = await replaceIdeaImageAction(await upload(file, { cardId: card.id }));
        if (!result.ok) setRowError(result.error.safeMessage);
        router.refresh();
      } finally {
        setBusy(null);
      }
    };
    input.click();
  };

  const remove = async (card: IdeaCardView) => {
    const ok = await confirm.confirm({
      title: "Delete this idea?",
      description: card.usages.length ? "The card is removed from your board. What it was used for in project schedules stays there." : "The card and its image are removed. This cannot be undone.",
      confirmLabel: "Delete idea",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(card.id); setRowError(null);
    try {
      const result = await ideaCardAction({ command: "delete", cardId: card.id });
      if (!result.ok) setRowError(result.error.safeMessage);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`grid gap-4 rounded-card ${intake.active ? "outline-2 outline-dashed outline-offset-8 outline-line-focus" : ""}`} {...intake.target}>
      <PillTabs
        label="Ideas"
        items={[
          { key: "all", label: "All", count: cards.length, active: view === "all", onSelect: () => setView("all") },
          { key: "unused", label: "Not used yet", count: cards.length - usedCount, active: view === "unused", onSelect: () => setView("unused") },
          { key: "used", label: "Used", count: usedCount, active: view === "used", onSelect: () => setView("used") },
        ]}
        actions={
          <>
            <input ref={picker} type="file" accept={ACCEPTED} multiple hidden onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void add(files); }} />
            <Button size="sm" variant="primary" leadingIcon={<ImagePlus className="h-4 w-4" />} pending={adding > 0} onClick={() => picker.current?.click()}>Add images</Button>
          </>
        }
      />
      <Text size="sm" tone="tertiary">{adding > 0 ? `Adding ${adding} image${adding === 1 ? "" : "s"}…` : "Paste (Ctrl+V) or drop images anywhere here."}</Text>
      {problems.length > 0 ? <InlineError>{problems.join(" ")}</InlineError> : null}
      {rowError ? <InlineError>{rowError}</InlineError> : null}

      {cards.length === 0 ? (
        <EmptyState icon={ImagePlus} title="No ideas yet" description="Copy an image from Pinterest or any website and press Ctrl+V here, or drop a downloaded picture. Sort it out later." />
      ) : shown.length === 0 ? (
        <EmptyState title={view === "used" ? "Nothing used yet" : "Every idea has been used"} description="Switch to All to see every card." />
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="Idea cards">
          {shown.map((card) => (
            <li key={card.id} className="group grid content-start gap-2 rounded-card border border-line-subtle bg-surface p-2">
              <ImageGallery images={[{ id: card.id, url: card.imageUrl }]} label={card.title ?? "Idea image"} className="[&_li]:w-full [&_button]:aspect-square [&_button]:h-auto [&_button]:w-full" />
              <div className="flex items-start gap-1">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <Text size="sm" weight="semibold" className={card.title ? "truncate" : "truncate text-ink-tertiary"}>{card.title ?? "Untitled"}</Text>
                  {card.sourceUrl ? (
                    <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-xs text-ink-secondary underline-offset-2 hover:underline">{hostOf(card.sourceUrl)}</a>
                  ) : null}
                </div>
                <RowActionMenu
                  label="Idea actions"
                  pending={busy === card.id}
                  items={[
                    { label: "Use in schedule…", onSelect: () => setUsing(card), disabled: targets.length === 0 },
                    { label: "Edit details", onSelect: () => setEditing(card) },
                    { label: "Replace image", onSelect: () => replaceImage(card) },
                    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => void remove(card) },
                  ]}
                />
              </div>
              {card.note ? <Text size="sm" tone="secondary" className="line-clamp-3 whitespace-pre-wrap">{card.note}</Text> : null}
              {card.usages.length > 0 ? (
                <ul className="m-0 grid list-none gap-1 p-0" aria-label="Used in">
                  {card.usages.map((usage) => (
                    <li key={usage.id} className="flex min-w-0 items-center gap-1.5">
                      <Badge tone="success" className="shrink-0">{usage.code} {usage.label}</Badge>
                      <Link href={STUDIOFLOW_ROUTES.projectSchedule(usage.projectId)} prefetch={false} title={usage.projectName} className="min-w-0 truncate text-xs text-ink-secondary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-line-focus">{usage.projectName}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editing ? <EditDialog key={editing.id} card={editing} onClose={() => setEditing(null)} /> : null}
      {using ? <UseDialog key={using.id} card={using} targets={targets} onClose={() => setUsing(null)} /> : null}
      {confirm.dialog}
    </div>
  );
}

function EditDialog({ card, onClose }: { card: IdeaCardView; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(card.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(card.sourceUrl ?? "");
  const [note, setNote] = useState(card.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }} title="Idea details" description="All optional. The link is only kept as a reference.">
      <form className="grid gap-3" onSubmit={async (event) => {
        event.preventDefault();
        setPending(true); setError(null);
        const result = await ideaCardAction({ command: "update", cardId: card.id, title, sourceUrl, note });
        setPending(false);
        if (!result.ok) { setError(result.error.safeMessage); return; }
        router.refresh();
        onClose();
      }}>
        <Field label="Title"><Input value={title} maxLength={160} autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Pink translucent stone" /></Field>
        <Field label="Link" description="Where it came from, e.g. the Pinterest page."><Input type="url" value={sourceUrl} maxLength={2000} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://" /></Field>
        <Field label="Note"><Textarea rows={3} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="e.g. maybe for the cashier wall" /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending}>Save</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}

type Entry = { id: string; section: string; category: string; code: string; productName: string | null; options: number };

function UseDialog({ card, targets, onClose }: { card: IdeaCardView; targets: Target[]; onClose: () => void }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(targets.length === 1 ? targets[0].id : "");
  const [mode, setMode] = useState<"new-item" | "option">("new-item");
  const [section, setSection] = useState("MATERIAL");
  const [category, setCategory] = useState("");
  const [entryId, setEntryId] = useState("");
  const [productName, setProductName] = useState(card.title ?? "");
  const [notes, setNotes] = useState(card.note ?? "");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [categories, setCategories] = useState<Array<{ section: string; category: string }>>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ projectId: string; code: string; label: string } | null>(null);

  useEffect(() => {
    let live = true;
    void listIdeaCategoryChoicesAction().then((result) => { if (live && result.ok) setCategories(result.data); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    void listIdeaTargetEntriesAction(projectId).then((result) => {
      if (!live) return;
      if (result.ok) setEntries(result.data); else setError(result.error.safeMessage);
    });
    return () => { live = false; };
  }, [projectId]);

  const project = targets.find((target) => target.id === projectId);
  const sectionCategories = [...new Set(categories.filter((choice) => choice.section === section).map((choice) => choice.category))];
  const ready = Boolean(projectId && productName.trim() && (mode === "new-item" ? category.trim() : entryId));

  if (done) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Added to the schedule">
        <div className="grid gap-3">
          <Notice tone="success">Added to {project?.name} as {done.code} option {done.label}. It is a draft option: choose Final in the schedule when the client decides.</Notice>
          <FormActions>
            <Button onClick={onClose}>Close</Button>
            <Link href={STUDIOFLOW_ROUTES.projectSchedule(done.projectId)} prefetch={false} className={buttonClasses("primary")}>Open schedule</Link>
          </FormActions>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }} title="Use in schedule" description="A copy goes into the project's Product Schedule. Changing or deleting this card later does not change the schedule." size="lg">
      <form className="grid gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (!ready) return;
        setPending(true); setError(null);
        const result = await applyIdeaToScheduleAction({
          cardId: card.id,
          projectId,
          target: mode === "new-item" ? { kind: "new-item", section, category } : { kind: "option", entryId },
          option: { productName, notes },
        });
        setPending(false);
        if (!result.ok) { setError(result.error.safeMessage); return; }
        router.refresh();
        setDone({ projectId: result.data.projectId, code: result.data.code, label: result.data.label });
      }}>
        <Field label="Project" required description="Projects whose schedule you may change.">
          <Select value={projectId} onChange={(event) => { setProjectId(event.target.value); setEntries(null); setEntryId(""); setError(null); }}>
            <option value="">Choose a project…</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </Select>
        </Field>
        <RadioGroup
          label="Add as"
          orientation="horizontal"
          value={mode}
          onValueChange={(value) => setMode(value as typeof mode)}
          options={[
            { value: "new-item", label: "New item", description: "Gets its own code, e.g. ST-04" },
            { value: "option", label: "Option on an existing item", description: "e.g. ST-02 option B", disabled: entries !== null && entries.length === 0 },
          ]}
        />
        {mode === "new-item" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Section" required>
              <Select value={section} onChange={(event) => setSection(event.target.value)}>
                <option value="MATERIAL">Material</option>
                <option value="FIXTURE">Fixture</option>
              </Select>
            </Field>
            <Field label="Category" required description="Pick one or type a new one.">
              <Input value={category} maxLength={80} list="idea-categories" onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Stone" />
            </Field>
            <datalist id="idea-categories">{sectionCategories.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
        ) : (
          <Field label="Item" required>
            <Select value={entryId} disabled={!projectId || entries === null} onChange={(event) => setEntryId(event.target.value)}>
              <option value="">{!projectId ? "Choose a project first" : entries === null ? "Loading…" : "Choose an item…"}</option>
              {(entries ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.category}{entry.productName ? ` · ${entry.productName}` : ""}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Product name" required description="Shown as the option's title in the schedule."><Input value={productName} maxLength={200} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Calacatta Viola" /></Field>
        <Field label="Notes"><Textarea rows={2} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!ready}>Add to schedule</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
