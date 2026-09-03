"use client";

import { ArrowUpRight, Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  InlineError,
  Input,
  StatusBadge,
  Text,
  Textarea,
} from "@/platform/ui_engine";
import type { BqLibItemRead } from "@/apps/bq/public";

import { approvePromotionAction, rejectPromotionAction, requestPromotionAction } from "./actions";

/** Only these three library types have a Master Data counterpart (§4/K-11). */
const PROMOTABLE_TYPES = new Set(["material", "labor", "material_labor"]);

type PromotableType = "material" | "labor" | "material_labor";

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

export function PromotionQueue({ items }: { items: readonly BqLibItemRead[] }) {
  const requested = items.filter((item) => item.promotionStatus === "REQUESTED" && PROMOTABLE_TYPES.has(item.type));
  const [approving, setApproving] = useState<BqLibItemRead | null>(null);
  const [rejecting, setRejecting] = useState<BqLibItemRead | null>(null);
  const { pending, error, run } = useCommand();

  if (requested.length === 0) {
    return (
      <EmptyState
        title="Tidak ada pengajuan"
        description="Belum ada item Library yang menunggu keputusan promosi."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {error ? <InlineError>{error}</InlineError> : null}
      {requested.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-medium text-ink">{item.name}</span>
            <Text tone="tertiary" size="sm">
              {item.purchaseUnit}
              {item.baseUnit ? ` · base ${item.baseUnit}` : ""} · {item.kategori}
            </Text>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge tone="warning">REQUESTED</StatusBadge>
            <Button size="sm" variant="secondary" leadingIcon={<Check aria-hidden="true" />} disabled={pending} onClick={() => setApproving(item)}>
              Setujui
            </Button>
            <Button size="sm" variant="ghost" leadingIcon={<X aria-hidden="true" />} disabled={pending} onClick={() => setRejecting(item)}>
              Tolak
            </Button>
          </div>
        </div>
      ))}

      <Dialog
        open={approving !== null}
        onOpenChange={(next) => { if (!next) setApproving(null); }}
        title="Setujui promosi"
        description="Buat entry-nya lebih dulu di Master Data lewat workflow pricing biasa, lalu catat ID-nya di sini. Harga tidak ikut dipromosikan."
        size="sm"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (!approving) return;
            run(
              approvePromotionAction,
              {
                type: approving.type as PromotableType,
                libItemId: approving.id,
                masterdataRefId: String(formData.get("masterdataRefId") ?? ""),
              },
              () => setApproving(null),
            );
          }}
        >
          <Field label="Master Data entry ID" required description="ID entry yang sudah dibuat di Master Data. Tautan ini yang dicatat pada item Library.">
            <Input name="masterdataRefId" required maxLength={64} autoFocus />
          </Field>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => setApproving(null)}>Batal</Button>
            <Button type="submit" variant="primary" pending={pending}>Setujui</Button>
          </FormActions>
        </form>
      </Dialog>

      <Dialog
        open={rejecting !== null}
        onOpenChange={(next) => { if (!next) setRejecting(null); }}
        title="Tolak promosi"
        description="Item tetap REJECTED sampai direvisi dan diajukan ulang."
        size="sm"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (!rejecting) return;
            run(
              rejectPromotionAction,
              {
                type: rejecting.type as PromotableType,
                libItemId: rejecting.id,
                reason: String(formData.get("reason") ?? ""),
              },
              () => setRejecting(null),
            );
          }}
        >
          <Field label="Alasan" required>
            <Textarea name="reason" required maxLength={500} autoFocus />
          </Field>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>Batal</Button>
            <Button type="submit" variant="danger" pending={pending}>Tolak</Button>
          </FormActions>
        </form>
      </Dialog>
    </div>
  );
}
