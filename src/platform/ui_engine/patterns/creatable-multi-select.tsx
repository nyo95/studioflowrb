"use client";

import { Check, ChevronDown, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { getComboboxNavigationIndex, type ComboboxNavigationKey } from "../internal/combobox-navigation";
import { Input, Text } from "../primitives";
import type { CreatableSearchOption } from "./creatable-search";

export type CreatableMultiSelectProps = {
  options: readonly CreatableSearchOption[];
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  onCreate?: (label: string) => string | void | Promise<string | void>;
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  createLabel?: (query: string) => string;
  creatingLabel?: (query: string) => string;
  createErrorLabel?: (error: unknown) => ReactNode;
  disabled?: boolean;
  className?: string;
};

const normalize = (value: string) => value.trim().toLowerCase();

/** A domain-neutral, accessible token picker. Apps own option creation and persistence. */
export function CreatableMultiSelect({
  options,
  value,
  onValueChange,
  onCreate,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No matches found",
  createLabel,
  creatingLabel = (query) => `Creating “${query}”…`,
  createErrorLabel = () => "Could not create that entry. Try again.",
  disabled = false,
  className,
}: CreatableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ReactNode>(null);
  const listboxId = useId();
  const statusId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selected = useMemo(() => value.map((id) => options.find((option) => option.id === id) ?? { id, label: id }), [options, value]);
  const visibleOptions = useMemo(() => {
    const term = normalize(query);
    return options.filter((option) => !value.includes(option.id) && (!term || [option.label, ...(option.keywords ?? [])].some((entry) => normalize(entry).includes(term))));
  }, [options, query, value]);
  const exactMatch = useMemo(() => options.find((option) => normalize(option.label) === normalize(query)) ?? null, [options, query]);
  const canCreate = Boolean(onCreate) && normalize(query).length > 0 && !exactMatch;

  const add = (id: string) => {
    if (!value.includes(id)) onValueChange([...value, id]);
    setCreateError(null);
    setQuery("");
  };
  const remove = (id: string) => onValueChange(value.filter((item) => item !== id));
  const create = async () => {
    if (!onCreate || creating) return;
    const text = query.trim();
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreate(text);
      add(typeof created === "string" ? created : text);
    } catch (error) {
      setCreateError(createErrorLabel(error));
    } finally {
      setCreating(false);
    }
  };
  const focusOption = (currentIndex: number, key: ComboboxNavigationKey) => {
    const nextIndex = getComboboxNavigationIndex(visibleOptions.map((option) => option.disabled === true), currentIndex, key);
    if (nextIndex !== null) optionRefs.current[nextIndex]?.focus();
  };
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "Backspace" && !query && value.length) { event.preventDefault(); remove(value[value.length - 1]); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); setOpen(true); focusOption(-1, event.key as ComboboxNavigationKey); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (exactMatch && !value.includes(exactMatch.id)) add(exactMatch.id);
    else if (canCreate) void create();
    else if (visibleOptions.length === 1) add(visibleOptions[0].id);
  };
  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, id: string) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); add(id); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); focusOption(index, event.key as ComboboxNavigationKey); }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open}
          className={cx("flex min-h-10 w-full items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-left text-sm text-ink transition-colors hover:border-ink-tertiary disabled:cursor-not-allowed disabled:opacity-60", className)}>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {selected.length ? selected.map((option) => <span key={option.id} className="inline-flex max-w-full items-center gap-1 rounded-pill bg-surface-muted px-2 py-0.5 text-xs"><span className="truncate">{option.label}</span><span role="button" tabIndex={0} aria-label={`Remove ${option.label}`} onClick={(event) => { event.stopPropagation(); remove(option.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); remove(option.id); } }}><X aria-hidden="true" className="h-3 w-3" /></span></span>) : <span className="text-ink-tertiary">{placeholder}</span>}
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-tertiary" />
        </button>
      </Popover.Trigger>
      <Popover.Portal><Popover.Content sideOffset={5} align="start" className="z-[65] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated">
        <div className="relative border-b border-line-subtle p-[7px] [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:left-[17px] [&>svg]:top-1/2 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:-translate-y-1/2 [&>svg]:text-ink-tertiary"><Search aria-hidden="true" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder={searchPlaceholder} className="pl-[31px]" role="combobox" aria-expanded aria-controls={listboxId} aria-autocomplete="list" aria-describedby={createError || creating ? statusId : undefined} /></div>
        <div id={listboxId} role="listbox" aria-label={label} className="max-h-[260px] overflow-auto p-[5px]">
          {visibleOptions.map((option, index) => <button key={option.id} ref={(element) => { optionRefs.current[index] = element; }} type="button" role="option" aria-selected={false} disabled={option.disabled} onKeyDown={(event) => onOptionKeyDown(event, index, option.id)} onClick={() => add(option.id)} className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-1.5 rounded-action border-0 bg-transparent px-2 py-[7px] text-left text-ink disabled:opacity-45 enabled:hover:bg-surface-muted"><span className="flex items-center">{value.includes(option.id) ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}</span><span className="min-w-0 truncate font-medium">{option.label}</span></button>)}
        </div>
        {!visibleOptions.length && !canCreate ? <div className="px-2.5 py-[18px] text-center text-ink-secondary">{emptyLabel}</div> : null}
        {canCreate ? <div className="border-t border-line-subtle p-[5px]"><button type="button" disabled={creating} onClick={() => void create()} className="flex w-full items-center gap-2 rounded-action px-2 py-2 text-left hover:bg-surface-muted disabled:opacity-60"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-action text-ink-inverse">{creating ? <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-ui-spin" /> : <Plus aria-hidden="true" className="h-3 w-3" />}</span><span className="truncate font-medium">{creating ? creatingLabel(query.trim()) : createLabel?.(query.trim()) ?? `Create “${query.trim()}”`}</span></button></div> : null}
        {createError ? <Text id={statusId} role="alert" size="sm" className="border-t border-line-subtle bg-danger-surface px-2.5 py-2 text-danger">{createError}</Text> : null}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  );
}
