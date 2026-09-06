import { Button, EmptyState, Field, Input, SectionCard, Text, Textarea } from "@/platform/ui_engine";
import type { BqPromotionRequest } from "@/apps/bq/public";
import { approveBqPromotionAction, rejectBqPromotionAction } from "./promotion-actions";

export function PromotionReview({ requests }: { requests: readonly BqPromotionRequest[] }) {
  if (requests.length === 0) {
    return <SectionCard><EmptyState title="Tidak ada pengajuan" description="Belum ada item BQ yang menunggu approval Master Data." /></SectionCard>;
  }

  return (
    <div className="grid gap-3">
      {requests.map((request) => (
        <SectionCard key={`${request.type}-${request.id}`}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-1">
              <Text weight="medium">{request.name}</Text>
              <Text tone="tertiary" size="sm">{request.type} · {request.purchaseUnit}{request.baseUnit ? ` · base ${request.baseUnit}` : ""} · {request.kategori}</Text>
              {request.notes ? <Text tone="tertiary" size="sm">{request.notes}</Text> : null}
            </div>
            <div className="grid gap-3">
              <form action={async (formData) => { await approveBqPromotionAction(formData); }} className="grid gap-2">
                <input type="hidden" name="type" value={request.type} />
                <input type="hidden" name="libItemId" value={request.id} />
                <Field label="Master Data price ID" required description="Buat entry melalui Pricing terlebih dahulu, lalu masukkan ID price yang aktif.">
                  <Input name="masterdataRefId" required maxLength={64} />
                </Field>
                <Button type="submit" size="sm" variant="primary">Approve dan hubungkan</Button>
              </form>
              <form action={async (formData) => { await rejectBqPromotionAction(formData); }} className="grid gap-2">
                <input type="hidden" name="type" value={request.type} />
                <input type="hidden" name="libItemId" value={request.id} />
                <Field label="Alasan reject" required>
                  <Textarea name="reason" required maxLength={500} />
                </Field>
                <Button type="submit" size="sm" variant="danger">Reject request</Button>
              </form>
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
