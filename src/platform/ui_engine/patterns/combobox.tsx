"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useMemo, useState, type ReactNode } from "react";

import { cx } from "../internal/cx";
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
            />
          </div>
          <div id={listboxId} className="ui-combobox-options" role="listbox" aria-label={label}>
            {visibleOptions.length ? visibleOptions.map((option) => (
              <button
                type="button"
                className="ui-combobox-option"
                role="option"
                aria-selected={option.id === value}
                disabled={option.disabled}
                key={option.id}
                onClick={() => {
                  onValueChange(option.id);
                  setOpen(false);
                  updateQuery("");
                }}
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
