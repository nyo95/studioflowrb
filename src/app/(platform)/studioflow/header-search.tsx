"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Text, useDebouncedValue } from "@/platform/ui_engine";

import { globalSearchAction, type GlobalSearchResult } from "./actions";

const EMPTY: GlobalSearchResult = { projects: [], clients: [] };

/**
 * Header quick-search for StudioFlow — the prototype's `.a-search`: a standing
 * field between the app chip and the avatar, not an icon that has to be found
 * and clicked before it will accept a query. Cmd/Ctrl-K focuses it from
 * anywhere. Shown only inside /studioflow, same gating as StudioFlowNav.
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
  /* The modifier label is a client-only fact. useSyncExternalStore gives the
     server an empty snapshot and the client the real one, so the hint appears
     after hydration without a hydration mismatch and without setting state
     from an effect. The store never emits, so subscribe is a no-op. */
  const shortcutHint = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "\u2318K" : "Ctrl K"), []),
    useCallback(() => null, []),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        <div className="flex h-[27px] min-w-0 max-w-[300px] flex-1 items-center gap-[7px] rounded-action border border-line-subtle bg-rail-soft px-[9px] transition-colors focus-within:border-line-focus max-[560px]:max-w-none">
          <Search size={13} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search projects, items, MOM"
            aria-label="Search projects or clients"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] text-ink outline-none placeholder:text-ink-tertiary [&::-webkit-search-cancel-button]:appearance-none"
          />
          {shortcutHint ? (
            <kbd className="shrink-0 rounded-[4px] border border-line px-1 font-ui-mono text-[10px] leading-[14px] text-ink-tertiary max-[560px]:hidden">
              {shortcutHint}
            </kbd>
          ) : null}
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
