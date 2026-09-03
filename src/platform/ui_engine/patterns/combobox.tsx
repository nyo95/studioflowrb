"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { getComboboxNavigationIndex, type ComboboxNavigationKey } from "../internal/combobox-navigation";
import { Button, Input, Text } from "../primitives";

export type ComboboxOption = {
  id: string;
  label: string;
  description?: ReactNode;
  keywords?: readonly string[];
  disabled?: boolean;
};

export type ComboboxProps = {
  options: readonly ComboboxOption[];
  value?: string;
  onValueChange: (value: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function Combobox({
  options,
  value,
  onValueChange,
  query,
  onQueryChange,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No options",
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const listboxId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeQuery = query ?? internalQuery;
  const selected = options.find((option) => option.id === value);
  const visibleOptions = useMemo(() => {
    const normalized = activeQuery.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      [option.label, ...(option.keywords ?? [])].some((entry) => entry.toLowerCase().includes(normalized)),
    );
  }, [activeQuery, options]);

  const updateQuery = (nextQuery: string) => {
    if (query === undefined) setInternalQuery(nextQuery);
    onQueryChange?.(nextQuery);
  };

  const focusOption = (currentIndex: number, key: ComboboxNavigationKey) => {
    const nextIndex = getComboboxNavigationIndex(
      visibleOptions.map((option) => option.disabled === true),
      currentIndex,
      key,
    );
    if (nextIndex !== null) optionRefs.current[nextIndex]?.focus();
  };

  const selectOption = (optionId: string) => {
    onValueChange(optionId);
    setOpen(false);
    updateQuery("");
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Enter from the search field, per the shared keyboard contract. The rule
      // matches the creatable variant so one control never commits on a keystroke
      // the other ignores: an exact label match wins, otherwise a single
      // remaining result. Never a guess among several.
      event.preventDefault();
      const term = activeQuery.trim().toLowerCase();
      const enabled = visibleOptions.filter((option) => !option.disabled);
      const exact = term ? enabled.find((option) => option.label.toLowerCase() === term) : undefined;
      if (exact) selectOption(exact.id);
      else if (enabled.length === 1) selectOption(enabled[0].id);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
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
          className={cx("min-w-[190px] justify-between!", className)}
          variant="secondary"
          trailingIcon={<ChevronDown aria-hidden="true" />}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
        >
          {selected?.label ?? placeholder}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[65] w-[min(320px,calc(100vw-24px))] min-w-[190px] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated"
          sideOffset={5}
          align="start"
        >
          <div className="relative border-b border-line-subtle p-[7px] [&>svg]:absolute [&>svg]:left-[17px] [&>svg]:top-1/2 [&>svg]:z-[1] [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:-translate-y-1/2 [&>svg]:text-ink-tertiary">
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
              autoFocus
              onKeyDown={handleSearchKeyDown}
              className="pl-[31px]"
            />
          </div>
          <div id={listboxId} className="max-h-[260px] overflow-auto p-[5px]" role="listbox" aria-label={label}>
            {visibleOptions.length ? visibleOptions.map((option, index) => (
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-1.5 rounded-action border-0 bg-transparent px-2 py-[7px] text-left text-ink aria-selected:bg-surface-muted disabled:opacity-45 enabled:hover:bg-surface-muted"
                role="option"
                aria-selected={option.id === value}
                disabled={option.disabled}
                tabIndex={-1}
                key={option.id}
                onKeyDown={(event) => handleOptionKeyDown(event, index, option.id)}
                onClick={() => selectOption(option.id)}
              >
                <span className="flex min-h-5 items-center [&_svg]:h-3.5 [&_svg]:w-3.5">
                  {option.id === value ? <Check aria-hidden="true" /> : null}
                </span>
                <span>
                  <span className="block font-medium">{option.label}</span>
                  {option.description ? <Text as="span" size="sm" tone="secondary">{option.description}</Text> : null}
                </span>
              </button>
            )) : null}
          </div>
          {visibleOptions.length ? null : (
            <div className="px-2.5 py-[18px] text-center text-ink-secondary">{emptyLabel}</div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
