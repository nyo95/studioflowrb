"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Button, Dialog, Field, FormActions, InlineError, Input, Notice, RadioGroup, Select, Textarea, buttonClasses } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";

import { listIdeaCategoryChoicesAction, listIdeaTargetEntriesAction } from "./actions";

type Target = { id: string; name: string };

type Entry = { id: string; section: string; category: string; code: string; productName: string | null; options: number };

export type UseInScheduleInput = {
  projectId: string;
  target: { kind: "new-item"; section: string; category: string } | { kind: "option"; entryId: string };
  option: { productName: string; notes: string };
};
export type UseInScheduleResult = ActionResult<{ projectId: string; entryId: string; optionId: string; code: string; label: string }>;

/**
 * "Use in schedule" for any image: pick the project (when more than one), then a new item or an extra option.
 * What happens to the image afterwards stays with the caller's `apply`; the schedule always receives a copy.
 */
export function UseInScheduleDialog({ initialName, initialNotes, targets, apply, onClose }: { initialName: string; initialNotes: string; targets: Target[]; apply: (input: UseInScheduleInput) => Promise<UseInScheduleResult>; onClose: () => void }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(targets.length === 1 ? targets[0].id : "");
  const [mode, setMode] = useState<"new-item" | "option">("new-item");
  const [section, setSection] = useState("MATERIAL");
  const [category, setCategory] = useState("");
  const [entryId, setEntryId] = useState("");
  const [productName, setProductName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
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
        const result = await apply({
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
