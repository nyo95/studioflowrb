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
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
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
          className={cx("ui-combobox-trigger", className)}
          variant="secondary"
          trailingIcon={<ChevronDown aria-hidden="true" />}
          aria-label={label}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          role="combobox"
          disabled={disabled}
        >
          {selected?.label ?? placeholder}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="ui-combobox" sideOffset={5} align="start">
          <div className="ui-combobox-search">
            <Search aria-hidden="true" />
            <Input
              value={activeQuery}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Search ${label.toLowerCase()}`}
              autoFocus
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <div id={listboxId} className="ui-combobox-options" role="listbox" aria-label={label}>
            {visibleOptions.length ? visibleOptions.map((option, index) => (
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                className="ui-combobox-option"
                role="option"
                aria-selected={option.id === value}
                disabled={option.disabled}
                tabIndex={-1}
                key={option.id}
                onKeyDown={(event) => handleOptionKeyDown(event, index, option.id)}
                onClick={() => selectOption(option.id)}
              >
                <span className="ui-combobox-check">
                  {option.id === value ? <Check aria-hidden="true" /> : null}
                </span>
                <span>
                  <span className="ui-choice-label">{option.label}</span>
                  {option.description ? <Text as="span" size="sm" tone="secondary">{option.description}</Text> : null}
                </span>
              </button>
            )) : <div className="ui-combobox-empty">{emptyLabel}</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
