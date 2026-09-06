"use client";

import { ChevronDown, ChevronUp, LayoutList, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  Dialog,
  EmptyState,
  IconButton,
  InlineError,
  Input,
  Select,
  Text,
} from "@/platform/ui_engine";
import type { BqLibItemRead, BqTemplateRead, BqTemplateSectionRead } from "@/apps/bq/public";

import {
  addTemplateRecommendationAction,
  addTemplateSectionAction,
  deleteTemplateSectionAction,
  removeTemplateRecommendationAction,
  reorderTemplateSectionsAction,
} from "./actions";

/**
 * Template scaffold editor (bq-contract §8.3).
 *
 * A template is Sections, optional Subsections, and optional pointers to Library
 * items. The pointers stay live references: a snapshot is taken only when an item
 * reaches a project, so editing the Library still updates what a template
 * recommends.
 */
export function TemplateSectionsButton({
  template,
  libraryItems,
}: {
  template: BqTemplateRead;
  libraryItems: readonly BqLibItemRead[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        title="Edit sections"
        onClick={() => setOpen(true)}
      >
        <LayoutList size={15} aria-hidden="true" />
      </Button>
      <TemplateSectionsDialog template={template} libraryItems={libraryItems} open={open} onOpenChange={setOpen} />
    </>
  );
}

function TemplateSectionsDialog({
  template,
  libraryItems,
  open,
  onOpenChange,
}: {
  template: BqTemplateRead;
  libraryItems: readonly BqLibItemRead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sections = template.sections.filter((section) => !section.parentId);
  const childrenOf = (parentId: string) => template.sections.filter((section) => section.parentId === parentId);

  const run = (action: (prev: null, data: FormData) => Promise<{ ok: boolean; error?: { safeMessage: string } }>, fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(async () => {
      const result = await action(null, data);
      if (!result.ok) {
        setError(result.error?.safeMessage ?? "Something went wrong.");
        return;
      }
      setError(null);
      router.refresh();
    });
  };

  const move = (list: readonly BqTemplateSectionRead[], id: string, delta: -1 | 1) => {
    const ids = list.map((entry) => entry.id);
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(reorderTemplateSectionsAction, { templateId: template.id, orderedIds: ids.join(",") });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Sections — ${template.name}`}
      description="Kerangka Section dan Subsection yang akan di-scaffold saat template ini dimuat ke project baru."
      size="lg"
    >
      <div className="grid gap-3">
        {error ? <InlineError>{error}</InlineError> : null}

        {sections.length === 0 ? (
          <EmptyState
            title="Template masih kosong"
            description="Tambahkan Section agar template ini menghasilkan kerangka saat dimuat."
          />
        ) : null}

        {sections.map((section) => {
          const children = childrenOf(section.id);
          return (
            <div key={section.id} className="grid gap-2 rounded-control border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{section.name}</span>
                <div className="flex items-center gap-0.5">
                  <IconButton size="sm" variant="ghost" label={`Move ${section.name} up`} icon={<ChevronUp aria-hidden="true" />} disabled={pending} onClick={() => move(sections, section.id, -1)} />
                  <IconButton size="sm" variant="ghost" label={`Move ${section.name} down`} icon={<ChevronDown aria-hidden="true" />} disabled={pending} onClick={() => move(sections, section.id, 1)} />
                  <IconButton size="sm" variant="ghost" label={`Delete ${section.name}`} icon={<Trash2 aria-hidden="true" />} disabled={pending} onClick={() => run(deleteTemplateSectionAction, { id: section.id })} />
                </div>
              </div>

              {children.length > 0 ? (
                <ul className="grid gap-1 pl-4">
                  {children.map((child) => (
                    <li key={child.id} className="grid gap-2 rounded-action bg-surface-muted px-2 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink-secondary">{child.name}</span>
                        <IconButton size="sm" variant="ghost" label={`Delete ${child.name}`} icon={<X aria-hidden="true" />} disabled={pending} onClick={() => run(deleteTemplateSectionAction, { id: child.id })} />
                      </div>
                      <Recommendations
                        section={child}
                        libraryItems={libraryItems}
                        pending={pending}
                        onAdd={(libItemId, libItemType) => run(addTemplateRecommendationAction, { templateSectionId: child.id, libItemId, libItemType })}
                        onRemove={(id) => run(removeTemplateRecommendationAction, { id })}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}

              <Recommendations
                section={section}
                libraryItems={libraryItems}
                pending={pending}
                onAdd={(libItemId, libItemType) => run(addTemplateRecommendationAction, { templateSectionId: section.id, libItemId, libItemType })}
                onRemove={(id) => run(removeTemplateRecommendationAction, { id })}
              />

              <AddNameForm
                label="Subsection"
                placeholder="Nama subsection"
                disabled={pending}
                onAdd={(name) => run(addTemplateSectionAction, { templateId: template.id, name, parentId: section.id })}
              />
            </div>
          );
        })}

        <AddNameForm
          label="Section"
          placeholder="Nama section"
          disabled={pending}
          onAdd={(name) => run(addTemplateSectionAction, { templateId: template.id, name })}
        />
      </div>
    </Dialog>
  );
}

function Recommendations({
  section,
  libraryItems,
  pending,
  onAdd,
  onRemove,
}: {
  section: BqTemplateSectionRead;
  libraryItems: readonly BqLibItemRead[];
  pending: boolean;
  onAdd: (libItemId: string, libItemType: string) => void;
  onRemove: (id: string) => void;
}) {
  const [choice, setChoice] = useState("");

  return (
    <div className="grid gap-1.5">
      <Text tone="tertiary" size="sm">Recommended items</Text>
      {section.recommendations.length > 0 ? (
        <ul className="grid gap-1">
          {section.recommendations.map((recommendation) => (
            <li key={recommendation.id} className="flex items-center justify-between gap-2 text-ink-secondary">
              <span className="truncate">{recommendation.libItem?.name ?? "Library item unavailable"}</span>
              <IconButton size="sm" variant="ghost" label="Remove recommendation" icon={<X aria-hidden="true" />} disabled={pending} onClick={() => onRemove(recommendation.id)} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          aria-label="Library item"
          className="max-w-[280px]"
          value={choice}
          disabled={pending || libraryItems.length === 0}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Pilih item Library…</option>
          {libraryItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Plus aria-hidden="true" />}
          disabled={pending || !choice}
          onClick={() => {
            const item = libraryItems.find((candidate) => candidate.id === choice);
            if (!item) return;
            onAdd(item.id, item.type);
            setChoice("");
          }}
        >
          Tambah
        </Button>
      </div>
    </div>
  );
}

function AddNameForm({
  label,
  placeholder,
  disabled,
  onAdd,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAdd(name.trim());
        setName("");
      }}
    >
      <Input
        value={name}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-[220px]"
        onChange={(event) => setName(event.target.value)}
      />
      <Button size="sm" variant="ghost" type="submit" leadingIcon={<Plus aria-hidden="true" />} disabled={disabled || !name.trim()}>
        {label}
      </Button>
    </form>
  );
}
