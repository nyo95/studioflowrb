import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { pricingService, categoryService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import { WORK_PRICE_KINDS } from "@/apps/masterdata/domain/pricing-rules";
import { updateWorkPriceAction } from "../../../actions";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function EditWorkPricePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [allWork, categories, units, parties] = await Promise.all([
    pricingService.listWorkPrices(CTX, true),
    categoryService.list(CTX, { kind: "WORK" }),
    unitService.list(CTX),
    partyService.list(CTX),
  ]);

  const wp = allWork.find((w) => w.id === id);
  if (!wp) notFound();

  const liveCategories = categories.filter((c) => !c.deletedAt);
  const liveUnits = units.filter((u) => !u.deletedAt);
  const vendors = parties.filter((p) => !p.deletedAt && p.roles.includes("WORK_VENDOR"));

  async function handleUpdate(formData: FormData) {
    "use server";
    await updateWorkPriceAction(formData);
    redirect("/masterdata/pricing?tab=work");
  }

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">Edit Work Price</h1>
          <p className="ui-text" data-tone="secondary">{wp.name}</p>
        </div>
      </div>

      <form action={handleUpdate} className="ui-form">
        <input type="hidden" name="id" value={wp.id} />
        <input type="hidden" name="code" value={wp.code} />

        <div className="ui-form-field">
          <label className="ui-label">Code</label>
          <p className="ui-text" data-tone="secondary">{wp.code}</p>
          <span className="ui-text" data-tone="secondary" data-size="sm">Code is immutable after creation.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="name">Name *</label>
          <input id="name" name="name" type="text" className="ui-input" required defaultValue={wp.name} />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="kind">Kind *</label>
          <select id="kind" name="kind" className="ui-select" required defaultValue={wp.kind}>
            {WORK_PRICE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="categoryId">Work Category *</label>
          <select id="categoryId" name="categoryId" className="ui-select" required defaultValue={wp.categoryId}>
            <option value="">— select —</option>
            {liveCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="unitId">Unit *</label>
          <select id="unitId" name="unitId" className="ui-select" required defaultValue={wp.unitId}>
            <option value="">— select —</option>
            {liveUnits.map((u) => (
              <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="currency">Currency *</label>
          <input id="currency" name="currency" type="text" className="ui-input" required defaultValue={wp.currency} style={{ maxWidth: "8rem" }} />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="amount">Amount *</label>
          <input id="amount" name="amount" type="text" className="ui-input" required defaultValue={wp.amount} style={{ maxWidth: "14rem" }} />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="vendorPartyId">Vendor (optional)</label>
          <select id="vendorPartyId" name="vendorPartyId" className="ui-select" defaultValue={wp.vendorPartyId ?? ""}>
            <option value="">— none —</option>
            {vendors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="scopeNote">Scope Note</label>
          <input id="scopeNote" name="scopeNote" type="text" className="ui-input" defaultValue={wp.scopeNote ?? ""} />
          <span className="ui-text" data-tone="secondary" data-size="sm">Required when kind is MATERIAL_LABOR.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="ui-textarea" rows={2} defaultValue={wp.notes ?? ""} />
        </div>

        <div className="ui-toolbar">
          <button type="submit" className="ui-button" data-variant="primary" data-size="md">
            <span>Save Changes</span>
          </button>
          <Link href="/masterdata/pricing?tab=work" className="ui-button" data-variant="secondary" data-size="md">
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </div>
  );
}
