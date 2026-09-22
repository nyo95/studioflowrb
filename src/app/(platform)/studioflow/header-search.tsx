"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Input, Text } from "@/platform/ui_engine";

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

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void globalSearchAction(term).then((response) => {
        if (id !== requestId.current) return;
        setSearchedQuery(term);
        setResult(response.ok ? response.data : EMPTY);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

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
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Search projects and clients"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-action text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Search size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[65] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated"
        >
          <div className="relative border-b border-line-subtle p-[7px] [&>svg]:absolute [&>svg]:left-[17px] [&>svg]:top-1/2 [&>svg]:z-[1] [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:-translate-y-1/2 [&>svg]:text-ink-tertiary">
            <Search aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects or clients…"
              aria-label="Search projects or clients"
              autoFocus
              className="pl-[31px]"
            />
          </div>
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
