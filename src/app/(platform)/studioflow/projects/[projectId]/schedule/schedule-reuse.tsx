"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { specLine, type ScheduleEntryView } from "@/apps/studioflow/domain/schedule";
import {
  Badge,
  Button,
  InlineError,
  Input,
  Text,
} from "@/platform/ui_engine";
import { copyReusableScheduleOptionAction, searchReusableScheduleOptionsAction } from "../../../actions";
import { type Command, type ReuseHit, type Section } from "./schedule-shared";

/** Search the other projects' products. Shared by the entry panel (copy into an item) and Add item (start an item from one). */
export function ReuseSearch({ projectId, section, initialQuery = "", useLabel = "Use", pendingFor, onUse }: { projectId: string; section?: Section; initialQuery?: string; useLabel?: string; pendingFor?: (hit: ReuseHit) => boolean; onUse: (hit: ReuseHit) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<ReuseHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchReusableScheduleOptionsAction({ projectId, query: query.trim(), ...(section ? { section } : {}) });
      if (result.ok) setHits(result.data as ReuseHit[]);
      else setSearchError(result.error.safeMessage);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="grid gap-3">
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Input aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Brand, product, SKU, color…" maxLength={120} />
        <Button type="submit" variant="secondary" leadingIcon={<Search className="h-3.5 w-3.5" />} pending={searching} disabled={query.trim().length < 2}>Search</Button>
      </form>
      {searchError ? <InlineError>{searchError}</InlineError> : null}
      {hits === null ? null : hits.length === 0 ? (
        <Text tone="tertiary" size="sm">No matching products in other projects.</Text>
      ) : (
        <ul className="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
          {hits.map((hit) => (
            <li key={hit.optionId} className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{hit.productName}{hit.brandName ? <span className="font-normal text-ink-secondary"> · ex. {hit.brandName}</span> : null}</span>
                <span className="truncate text-xs text-ink-tertiary">{[specLine(hit), `${hit.sourceProjectName} · ${hit.category}`].filter(Boolean).join(" — ")}</span>
              </div>
              {hit.isFinal ? <Badge tone="success">Final there</Badge> : null}
              <Button size="sm" variant="primary" pending={pendingFor?.(hit)} onClick={() => onUse(hit)}>{useLabel}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InlineReuse({ projectId, entry, command, onClose }: { projectId: string; entry: ScheduleEntryView; command: Command; onClose: () => void }) {
  const use = async (hit: ReuseHit) => {
    const ok = await command.run(`${entry.id}-reuse-${hit.optionId}`, () => copyReusableScheduleOptionAction({ projectId, entryId: entry.id, sourceOptionId: hit.optionId }));
    if (ok) onClose();
  };

  return (
    <div className="grid gap-3 rounded-control border border-line-subtle bg-surface-muted p-3">
      <div className="flex items-start justify-between gap-2"><div><Text weight="semibold">From past project</Text><Text size="sm" tone="tertiary">Copy a product into {entry.code} as a new option.</Text></div><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
      <ReuseSearch projectId={projectId} section={entry.section as Section} initialQuery={entry.category} pendingFor={(hit) => command.isPending(`${entry.id}-reuse-${hit.optionId}`)} onUse={(hit) => void use(hit)} />
      {command.error ? <InlineError>{command.error}</InlineError> : null}
    </div>
  );
}
