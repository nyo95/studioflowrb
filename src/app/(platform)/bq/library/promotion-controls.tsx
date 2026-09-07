"use client";

import { ArrowUpRight } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  InlineError,
} from "@/platform/ui_engine";
import type { BqLibItemRead } from "@/apps/bq/public";

import { requestPromotionAction } from "./actions";

/** Only these three library types have a Master Data counterpart (§4/K-11). */
const PROMOTABLE_TYPES = new Set(["material", "labor", "material_labor"]);

function useCommand() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (
    action: (prev: null, data: FormData) => Promise<{ ok: boolean; error?: { safeMessage: string } }>,
    fields: Record<string, string>,
    onDone?: () => void,
  ) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(async () => {
      const result = await action(null, data);
      if (!result.ok) {
        setError(result.error?.safeMessage ?? "Something went wrong.");
        return;
      }
      setError(null);
      onDone?.();
      router.refresh();
    });
  };
  return { pending, error, run };
}

/**
 * Estimator-side request. Items whose category stops at BQ — Biaya Umum,
 * Transportasi & Akomodasi, Alat — never show this control at all (K-11).
 */
export function PromotionRequestButton({ item }: { item: BqLibItemRead }) {
  const { pending, error, run } = useCommand();
  if (!PROMOTABLE_TYPES.has(item.type)) return null;
  if (item.promotionStatus === "REQUESTED" || item.promotionStatus === "APPROVED") return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        title="Ajukan promosi ke Master Data"
        disabled={pending}
        onClick={() => run(requestPromotionAction, { type: item.type, libItemId: item.id })}
      >
        <ArrowUpRight size={15} aria-hidden="true" />
      </Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </>
  );
}
