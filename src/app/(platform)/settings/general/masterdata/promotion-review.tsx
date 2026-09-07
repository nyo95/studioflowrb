import { Button, EmptyState, Field, Select, SectionCard, Text, Textarea } from "@/platform/ui_engine";
import type { BqPromotionRequest } from "@/apps/bq/public";
import { approveBqPromotionAction, rejectBqPromotionAction } from "./promotion-actions";
import { PromotionDecisionForm } from "./promotion-decision-form";

export function PromotionReview({ requests, references }: { requests: readonly BqPromotionRequest[]; references: readonly { id: string; type: string; label: string }[] }) {
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
              <PromotionDecisionForm action={approveBqPromotionAction}>
                <input type="hidden" name="type" value={request.type} />
                <input type="hidden" name="libItemId" value={request.id} />
                <Field label="Master Data price" required description="Pilih harga aktif yang sesuai. Jika belum tersedia, buat melalui Pricing terlebih dahulu.">
                  <Select name="masterdataRefId" required defaultValue="">
                    <option value="">Select canonical price</option>
                    {references.filter(reference => reference.type === request.type).map(reference => <option key={reference.id} value={reference.id}>{reference.label}</option>)}
                  </Select>
                </Field>
                <Button type="submit" size="sm" variant="primary">Approve dan hubungkan</Button>
              </PromotionDecisionForm>
              <PromotionDecisionForm action={rejectBqPromotionAction}>
                <input type="hidden" name="type" value={request.type} />
                <input type="hidden" name="libItemId" value={request.id} />
                <Field label="Alasan reject" required>
                  <Textarea name="reason" required maxLength={500} />
                </Field>
                <Button type="submit" size="sm" variant="danger">Reject request</Button>
              </PromotionDecisionForm>
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
