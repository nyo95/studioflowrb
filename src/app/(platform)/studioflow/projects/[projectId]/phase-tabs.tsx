"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { PipelineStrip, type PipelineStep } from "@/platform/ui_engine";

/**
 * The phase strip as tabs (owner, 2026-10-13): choosing a phase swaps only the workflow bar under it. The page does
 * not reload or scroll, and the Workspace canvas below stays as it is; the address keeps `?phase=` so a link or a
 * reload opens the same phase.
 */
export function PhaseTabs({ steps, selectedId }: { steps: Omit<PipelineStep, "href" | "onSelect" | "selected">[]; selectedId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(selectedId);
  return (
    <PipelineStrip
      variant="track"
      label="Phase tabs"
      aria-busy={pending}
      steps={steps.map((step) => ({
        ...step,
        selected: step.id === shown,
        onSelect: () => startTransition(() => {
          setShown(step.id);
          router.push(`${pathname}?phase=${step.id}`, { scroll: false });
        }),
      }))}
    />
  );
}
