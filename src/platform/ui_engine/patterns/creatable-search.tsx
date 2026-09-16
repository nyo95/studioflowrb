"use client";

import { Check, ChevronDown, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { getComboboxNavigationIndex, type ComboboxNavigationKey } from "../internal/combobox-navigation";
import { cx } from "../internal/cx";
import { Button, Input, Text } from "../primitives";

export type CreatableSearchOption = {
  id: string;
  label: string;
  description?: ReactNode;
  keywords?: readonly string[];
  disabled?: boolean;
  badge?: ReactNode;
};

export type CreatableSearchGroup = {
  label: string;
  options: readonly CreatableSearchOption[];
};

export type CreatableSearchProps = {
  options?: readonly CreatableSearchOption[];
  groups?: readonly CreatableSearchGroup[];
  value?: string;
  onValueChange: (value: string) => void;
  onCreate?: (label: string) => string | void | Promise<string | void>;
  query?: string;
  onQueryChange?: (query: string) => void;
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  createLabel?: (query: string) => string;
  /** Shown while an app-supplied create command is in flight. */
  creatingLabel?: (query: string) => string;
  /** Presentation for a rejected create. The engine owns when; the app owns wording. */
  createErrorLabel?: (error: unknown) => ReactNode;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function CreatableSearch({
  options = [],
  groups,
  value,
  onValueChange,
  onCreate,
  query,
  onQueryChange,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No matches found",
  createLabel,
  creatingLabel = (query) => `Creating "${query}"…`,
  createErrorLabel = () => "Could not create that entry. Try again.",
  allowClear = false,
  clearLabel = "Clear",
  disabled = false,
  className,
}: CreatableSearchProps) {
  const [open, setOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ReactNode>(null);
  const [previousValue, setPreviousValue] = useState(value);
  const [wasOpen, setWasOpen] = useState(false);
  const listboxId = useId();
  const statusId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flatOptions = useMemo(() => (groups ? groups.flatMap((group) => group.options) : options), [groups, options]);
  const activeQuery = query ?? internalQuery;
  const selected = flatOptions.find((option) => option.id === value);

  const visibleOptions = useMemo(() => {
    const term = normalize(activeQuery);
    if (!term) return flatOptions;
    return flatOptions.filter((option) => {
      const haystack = [option.label, ...(option.keywords ?? [])].map(normalize);
      return haystack.some((entry) => entry.includes(term));
    });
  }, [activeQuery, flatOptions]);

  const exactMatch = useMemo(() => {
    const term = normalize(activeQuery);
    if (!term) return null;
    return flatOptions.find((option) => normalize(option.label) === term) ?? null;
  }, [activeQuery, flatOptions]);

  const canCreate = Boolean(onCreate) && normalize(activeQuery).length > 0 && !exactMatch;

  const updateQuery = (nextQuery: string) => {
    if (query === undefined) setInternalQuery(nextQuery);
    onQueryChange?.(nextQuery);
  };

  const selectOption = (optionId: string) => {
    setCreateError(null);
    onValueChange(optionId);
    setOpen(false);
    updateQuery("");
  };

  /**
   * The app owns the create command; the engine owns the busy and failure states
   * around it. Previously a rejected create surfaced as an unhandled rejection,
   * the overlay stayed open explaining nothing, and nothing stopped a second
   * click from creating the record twice.
   */
  const createOption = async (text: string) => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const createdValue = await onCreate?.(text);
      onValueChange(typeof createdValue === "string" ? createdValue : text);
      setOpen(false);
      updateQuery("");
    } catch (error) {
      setCreateError(createErrorLabel(error));
    } finally {
      setCreating(false);
    }
  };

  const focusOption = (currentIndex: number, key: ComboboxNavigationKey) => {
    const nextIndex = getComboboxNavigationIndex(
      visibleOptions.map((option) => option.disabled === true),
      currentIndex,
      key,
    );
    if (nextIndex !== null) optionRefs.current[nextIndex]?.focus();
  };

  // A value replaced from outside — a form reset, a parent switching records —
  // must not leave the previous search term sitting in the field. Adjusted
  // during render rather than in an effect, so no extra pass is scheduled.
  if (value !== previousValue) {
    setPreviousValue(value);
    if (query === undefined) setInternalQuery("");
    setCreateError(null);
  }

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setCreateError(null);
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (exactMatch) {
        selectOption(exactMatch.id);
      } else if (canCreate) {
        createOption(activeQuery.trim());
      } else if (visibleOptions.length === 1) {
        selectOption(visibleOptions[0].id);
      }
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    focusOption(-1, event.key as ComboboxNavigationKey);
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, optionId: string) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(optionId);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    focusOption(index, event.key as ComboboxNavigationKey);
  };


  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          className={cx("min-w-[190px] justify-between", className)}
          variant="secondary"
          trailingIcon={<ChevronDown aria-hidden="true" />}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          {selected?.label ?? placeholder}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[65] w-[min(360px,calc(100vw-24px))] min-w-[190px] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated"
          sideOffset={5}
          align="start"
        >
          <div className="relative border-b border-line-subtle p-[7px] [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:left-[17px] [&>svg]:top-1/2 [&>svg]:z-[1] [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:-translate-y-1/2 [&>svg]:text-ink-tertiary">
            <Search aria-hidden="true" />
            <Input
              value={activeQuery}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Search ${label.toLowerCase()}`}
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-describedby={createError || creating ? statusId : undefined}
              autoFocus
              onKeyDown={handleSearchKeyDown}
              className="pl-[31px] pr-8"
            />
            {allowClear && selected ? (
              <button
                type="button"
                onClick={() => selectOption("")}
                aria-label={`${clearLabel} ${label.toLowerCase()}`}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-action p-1 text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div id={listboxId} className="max-h-[260px] overflow-auto p-[5px]" role="listbox" aria-label={label}>
            {allowClear ? (
              <button
                type="button"
                className={cx(
                  "flex w-full items-center justify-between gap-2 rounded-action border-0 px-2 py-[7px] text-left text-ink",
                  !value ? "bg-surface-muted" : "bg-transparent hover:bg-surface-muted",
                )}
                role="option"
                aria-selected={!value}
                onClick={() => selectOption("")}
              >
                <span>{clearLabel}</span>
              </button>
            ) : null}

            {groups ? (
              groups.map((group, groupIndex) => {
                const visibleGroupOptions = group.options.filter((option) => visibleOptions.some((visible) => visible.id === option.id));
                if (!visibleGroupOptions.length) return null;
                return (
                  <div key={group.label}>
                    {groupIndex > 0 || allowClear ? <div className="my-1 h-px bg-line" /> : null}
                    <div className="px-2.5 py-1.5">
                      <Text meta tone="tertiary">
                        {group.label}
                      </Text>
                    </div>
                    {visibleGroupOptions.map((option) => {
                      const index = visibleOptions.findIndex((visible) => visible.id === option.id);
                      return (
                        <button
                          key={option.id}
                          ref={(element) => { optionRefs.current[index] = element; }}
                          type="button"
                          className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-1.5 rounded-action border-0 bg-transparent px-2 py-[7px] text-left text-ink aria-selected:bg-surface-muted disabled:opacity-45 enabled:hover:bg-surface-muted"
                          role="option"
                          aria-selected={option.id === value}
                          disabled={option.disabled}
                          tabIndex={-1}
                          onKeyDown={(event) => handleOptionKeyDown(event, index, option.id)}
                          onClick={() => selectOption(option.id)}
                        >
                          <span className="flex min-h-5 items-center [&_svg]:h-3.5 [&_svg]:w-3.5">
                            {option.id === value ? <Check aria-hidden="true" /> : null}
                          </span>
                          <span className="grid min-w-0 gap-0.5">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 truncate font-medium">{option.label}</span>
                              {option.badge ? <span className="shrink-0">{option.badge}</span> : null}
                            </span>
                            {option.description ? <Text as="span" size="sm" tone="secondary">{option.description}</Text> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            ) : visibleOptions.length ? (
              visibleOptions.map((option, index) => (
                <button
                  key={option.id}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-1.5 rounded-action border-0 bg-transparent px-2 py-[7px] text-left text-ink aria-selected:bg-surface-muted disabled:opacity-45 enabled:hover:bg-surface-muted"
                  role="option"
                  aria-selected={option.id === value}
                  disabled={option.disabled}
                  tabIndex={-1}
                  onKeyDown={(event) => handleOptionKeyDown(event, index, option.id)}
                  onClick={() => selectOption(option.id)}
                >
                  <span className="flex min-h-5 items-center [&_svg]:h-3.5 [&_svg]:w-3.5">
                    {option.id === value ? <Check aria-hidden="true" /> : null}
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-medium">{option.label}</span>
                      {option.badge ? <span className="shrink-0">{option.badge}</span> : null}
                    </span>
                    {option.description ? <Text as="span" size="sm" tone="secondary">{option.description}</Text> : null}
                  </span>
                </button>
              ))
            ) : null}

          </div>

          {!visibleOptions.length && !canCreate ? (
            <div className="px-2.5 py-[18px] text-center text-ink-secondary">{emptyLabel}</div>
          ) : null}

          {canCreate ? (
            <div className="p-[5px] pt-0">
              {(visibleOptions.length > 0 || allowClear) ? <div className="my-1 h-px bg-line" /> : null}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-action border-0 bg-[color-mix(in_srgb,var(--ui-surface-muted)_60%,var(--ui-surface))] px-2 py-2 text-left text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                disabled={creating}
                aria-busy={creating || undefined}
                onClick={() => createOption(activeQuery.trim())}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-action text-ink-inverse">
                  {creating
                    ? <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-ui-spin" />
                    : <Plus aria-hidden="true" className="h-3 w-3" />}
                </span>
                <span className="min-w-0 truncate font-medium">
                  {creating
                    ? creatingLabel(activeQuery.trim())
                    : createLabel?.(activeQuery.trim()) ?? `Create "${activeQuery.trim()}"`}
                </span>
                {creating ? null : <span className="ml-auto text-xs text-ink-tertiary">Enter ↵</span>}
              </button>
            </div>
          ) : null}

          {createError ? (
            <div
              id={statusId}
              role="alert"
              className="border-t border-line-subtle bg-danger-surface px-2.5 py-2 text-xs text-danger"
            >
              {createError}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
