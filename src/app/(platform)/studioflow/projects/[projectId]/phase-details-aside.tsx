"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button, Drawer, IconButton, Text } from "@/platform/ui_engine";

/**
 * The detail panel of the record workspace (DESIGN.md §6.2): 320px on the right from 1280px up, scrolling by itself and
 * folding to a button; narrower, a one-line bar that opens the same content in a drawer, so the notes keep the width.
 */
export function PhaseDetailsAside({ title, subtitle, summary, children }: { title: string; subtitle: string | null; summary: string; children: ReactNode }) {
  const [folded, setFolded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const heading = subtitle ? `${title} · ${subtitle}` : title;
  return (
    <>
      {/* Narrow screens: one line above the notes. */}
      <div className="order-first flex shrink-0 items-center gap-2 rounded-card border border-line-subtle bg-surface px-3 py-2 xl:hidden">
        <Text size="sm" weight="semibold" className="min-w-0 truncate">{heading}</Text>
        <Text size="sm" tone="tertiary" className="min-w-0 flex-1 truncate">{summary}</Text>
        <Button type="button" size="sm" variant="ghost" leadingIcon={<PanelRightOpen className="h-3.5 w-3.5" />} onClick={() => setDrawerOpen(true)}>Phase details</Button>
      </div>
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title={`${title} · Phase details`} description={summary}>
        <div className="grid gap-4">{children}</div>
      </Drawer>

      {/* From 1280px: a column beside the notes, or a slim button when folded. */}
      {folded ? (
        <div className="hidden shrink-0 xl:block">
          <IconButton variant="secondary" label={`Show phase details (${summary})`} icon={<PanelRightOpen aria-hidden="true" />} onClick={() => setFolded(false)} />
        </div>
      ) : (
        <aside aria-label="Phase details" className="hidden w-80 shrink-0 flex-col overflow-hidden rounded-card border border-line-subtle bg-surface xl:flex">
          <div className="flex shrink-0 items-start gap-2 border-b border-line-subtle px-4 py-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <Text size="sm" weight="semibold" className="truncate">{heading}</Text>
              <Text size="sm" tone="tertiary" className="truncate">{summary}</Text>
            </div>
            <IconButton size="sm" variant="ghost" label="Hide phase details" icon={<PanelRightClose aria-hidden="true" />} onClick={() => setFolded(true)} />
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-3 [&>section]:shadow-none">{children}</div>
        </aside>
      )}
    </>
  );
}
