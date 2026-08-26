import Link from "next/link";
import { redirect } from "next/navigation";
import { categoryService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import { WORK_PRICE_KINDS } from "@/apps/masterdata/domain/pricing-rules";
import { createWorkPriceAction } from "../../actions";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export default async function NewWorkPricePage() {
  const [categories, units, parties] = await Promise.all([
    categoryService.list(CTX, { kind: "WORK" }),
    unitService.list(CTX),
    partyService.list(CTX),
  ]);

  const liveCategories = categories.filter((c) => !c.deletedAt);
  const liveUnits = units.filter((u) => !u.deletedAt);
  const vendors = parties.filter((p) => !p.deletedAt && p.roles.includes("WORK_VENDOR"));

  async function handleCreate(formData: FormData) {
    "use server";
    await createWorkPriceAction(formData);
    redirect("/masterdata/pricing?tab=work");
  }

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">New Work Price</h1>
          <p className="ui-text" data-tone="secondary">Add a work or labour price entry.</p>
        </div>
      </div>

      <form action={handleCreate} className="ui-form">
        <div className="ui-form-field">
          <label className="ui-label" htmlFor="code">Code *</label>
          <input id="code" name="code" type="text" className="ui-input" required autoFocus />
          <span className="ui-text" data-tone="secondary" data-size="sm">Unique identifier. Immutable after creation.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="name">Name *</label>
          <input id="name" name="name" type="text" className="ui-input" required />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="kind">Kind *</label>
          <select id="kind" name="kind" className="ui-select" required>
            {WORK_PRICE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="categoryId">Work Category *</label>
          {liveCategories.length === 0 ? (
            <p className="ui-text" data-tone="warning">No Work Categories available. Create a Work Category first.</p>
          ) : (
            <select id="categoryId" name="categoryId" className="ui-select" required>
              <option value="">— select —</option>
              {liveCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="unitId">Unit *</label>
          {liveUnits.length === 0 ? (
            <p className="ui-text" data-tone="warning">No units available. Create units first.</p>
          ) : (
            <select id="unitId" name="unitId" className="ui-select" required>
              <option value="">— select —</option>
              {liveUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
              ))}
            </select>
          )}
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="currency">Currency *</label>
          <input id="currency" name="currency" type="text" className="ui-input" required defaultValue="IDR" style={{ maxWidth: "8rem" }} />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="amount">Amount *</label>
          <input id="amount" name="amount" type="text" className="ui-input" required placeholder="0.00" style={{ maxWidth: "14rem" }} />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="vendorPartyId">Vendor (optional)</label>
          <select id="vendorPartyId" name="vendorPartyId" className="ui-select">
            <option value="">— none —</option>
            {vendors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="scopeNote">Scope Note</label>
          <input id="scopeNote" name="scopeNote" type="text" className="ui-input" />
          <span className="ui-text" data-tone="secondary" data-size="sm">Required when kind is MATERIAL_LABOR.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="ui-textarea" rows={2} />
        </div>

        <div className="ui-toolbar">
          <button type="submit" className="ui-button" data-variant="primary" data-size="md">
            <span>Create Work Price</span>
          </button>
          <Link href="/masterdata/pricing?tab=work" className="ui-button" data-variant="secondary" data-size="md">
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </div>
  );
}
