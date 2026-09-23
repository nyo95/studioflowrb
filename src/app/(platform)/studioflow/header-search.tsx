"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Input, Text, useDebouncedValue } from "@/platform/ui_engine";

import { globalSearchAction, type GlobalSearchResult } from "./actions";

const EMPTY: GlobalSearchResult = { projects: [], clients: [] };

/**
 * Header quick-search for StudioFlow. Collapsed to an icon until opened, so
 * the shared topbar stays compact on apps that don't need it (shown only
 * while inside /studioflow, same gating as StudioFlowNav/StudioFlowUtilityNav).
 */
export function StudioFlowHeaderSearch() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GlobalSearchResult>(EMPTY);
  // The query `result` actually answers. Comparing this against the live
  // `query` derives the loading state during render instead of setting it
  // synchronously from the effect (react-hooks/set-state-in-effect).
  const [searchedQuery, setSearchedQuery] = useState("");
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    const term = debouncedQuery.trim();
    if (!term) return;
    const id = ++requestId.current;
    void globalSearchAction(term).then((response) => {
      if (id !== requestId.current) return;
      setSearchedQuery(term);
      setResult(response.ok ? response.data : EMPTY);
    });
  }, [debouncedQuery]);

  if (!pathname.startsWith("/studioflow")) return null;

  const reset = () => {
    setQuery("");
    setResult(EMPTY);
    setSearchedQuery("");
  };
  const hasResults = result.projects.length > 0 || result.clients.length > 0;
  const trimmed = query.trim();
  const loading = trimmed !== "" && trimmed !== searchedQuery;

  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      {/* Anchor spans the icon + expanding input so the results panel below
          lines up with the whole row, while Trigger stays just the icon —
          it's the only element that opens/closes on click. */}
      <Popover.Anchor asChild>
        <div className="flex items-center">
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={open ? "Close search" : "Search projects and clients"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-action text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <Search size={16} aria-hidden="true" />
            </button>
          </Popover.Trigger>
          <div className={open ? "ml-1 w-40 max-w-[45vw] overflow-hidden opacity-100 transition-[width,opacity] duration-200 ease-out sm:w-64" : "ml-0 w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-150 ease-in"}>
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects or clients…"
              aria-label="Search projects or clients"
              tabIndex={open ? 0 : -1}
              className="h-8"
            />
          </div>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-[65] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated"
        >
          <div className="max-h-[320px] overflow-auto p-[5px]">
            {!trimmed ? (
              <Text as="p" size="sm" tone="tertiary" className="px-2.5 py-[18px] text-center">Start typing to search projects or clients.</Text>
            ) : loading ? (
              <Text as="p" size="sm" tone="tertiary" className="px-2.5 py-[18px] text-center">Searching…</Text>
            ) : !hasResults ? (
              <Text as="p" size="sm" tone="tertiary" className="px-2.5 py-[18px] text-center">No matches for &ldquo;{trimmed}&rdquo;.</Text>
            ) : (
              <>
                {result.projects.length > 0 ? (
                  <div role="group" aria-label="Projects">
                    <Text as="p" size="sm" tone="tertiary" className="px-2.5 pb-1 pt-2 text-label">Projects</Text>
                    {result.projects.map((project) => (
                      <Link
                        key={project.id}
                        href={STUDIOFLOW_ROUTES.project(project.id)}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className="grid gap-0.5 rounded-action px-2.5 py-[7px] text-left no-underline hover:bg-surface-muted"
                      >
                        <span className="truncate font-medium text-ink">{project.name}</span>
                        {project.clientName ? <span className="truncate text-xs text-ink-tertiary">{project.clientName}</span> : null}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {result.clients.length > 0 ? (
                  <div role="group" aria-label="Clients">
                    <Text as="p" size="sm" tone="tertiary" className="px-2.5 pb-1 pt-2 text-label">Clients</Text>
                    {result.clients.map((client) => (
                      <Link
                        key={client.id}
                        href={STUDIOFLOW_ROUTES.client(client.id)}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className="block truncate rounded-action px-2.5 py-[7px] font-medium text-ink no-underline hover:bg-surface-muted"
                      >
                        {client.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
