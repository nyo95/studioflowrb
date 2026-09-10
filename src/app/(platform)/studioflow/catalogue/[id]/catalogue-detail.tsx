"use client";

import { useState, useTransition } from "react";

import { Button, InlineError, SectionCard, useConfirm } from "@/platform/ui_engine";
import { CatalogueForm, type CatalogueBrandOption, type CatalogueFormValues } from "../catalogue-form";
import { archiveCatalogueAction, restoreCatalogueAction } from "../actions";

export function CatalogueDetailView({ brands, values, canManage, archived }: { brands: CatalogueBrandOption[]; values: CatalogueFormValues; canManage: boolean; archived: boolean }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const changeArchiveState = async () => {
    if (!values.id) return;
    if (!archived) {
      const accepted = await confirm.confirm({ title: "Archive this product?", description: "It will be hidden from the active reuse pool. Existing project snapshots remain unchanged.", confirmLabel: "Archive product", tone: "danger" });
      if (!accepted) return;
    }
    startTransition(async () => {
      const data = new FormData(); data.set("id", values.id ?? "");
      const result = archived ? await restoreCatalogueAction(null, data) : await archiveCatalogueAction(null, data);
      setFailure(result.ok ? null : result.error.safeMessage);
    });
  };

  return <div className="grid gap-6">
    <SectionCard><CatalogueForm brands={brands} values={values} disabled={!canManage || archived} /></SectionCard>
    {canManage ? <SectionCard title={archived ? "Restore product" : "Archive product"}>
      {failure ? <InlineError>{failure}</InlineError> : null}
      <p className="text-sm text-ink-tertiary">{archived ? "This specification is archived and hidden from the active catalogue." : "Archiving hides this specification from the active reuse pool. Existing project snapshots will not change."}</p>
      <div className="mt-3"><Button variant={archived ? "secondary" : "danger"} pending={pending} onClick={changeArchiveState}>{archived ? "Restore product" : "Archive product"}</Button></div>
    </SectionCard> : null}
    {confirm.dialog}
  </div>;
}
