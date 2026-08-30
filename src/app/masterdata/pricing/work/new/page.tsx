import Link from "next/link";
import { redirect } from "next/navigation";
import { categoryService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import { WORK_PRICE_KINDS } from "@/apps/masterdata/domain/pricing-rules";
import {
  Button,
  Field,
  Input,
  PageHeader,
  PageShell,
  Select,
  Text,
  Textarea,
  buttonClasses,
} from "@/platform/ui_engine";
import { createWorkPriceAction } from "../../actions";


export default async function NewWorkPricePage() {
  const [categories, units, parties] = await Promise.all([
    categoryService.list((await requireMasterDataRequestContext()), { kind: "WORK" }),
    unitService.list((await requireMasterDataRequestContext())),
    partyService.list((await requireMasterDataRequestContext())),
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
    <PageShell>
      <PageHeader title="New Work Price" description="Add a work or labour price entry." />

      <form action={handleCreate} className="grid gap-4">
        <Field label="Code" required description="Unique identifier. Immutable after creation.">
          <Input name="code" type="text" required autoFocus />
        </Field>

        <Field label="Name" required>
          <Input name="name" type="text" required />
        </Field>

        <Field label="Kind" required>
          <Select name="kind" required>
            {WORK_PRICE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        </Field>

        <Field label="Work Category" required>
          {liveCategories.length === 0 ? (
            <Text as="p" className="text-warning">No Work Categories available. Create a Work Category first.</Text>
          ) : (
            <Select name="categoryId" required>
              <option value="">— select —</option>
              {liveCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Unit" required>
          {liveUnits.length === 0 ? (
            <Text as="p" className="text-warning">No units available. Create units first.</Text>
          ) : (
            <Select name="unitId" required>
              <option value="">— select —</option>
              {liveUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Currency" required>
          <Input name="currency" type="text" required defaultValue="IDR" style={{ maxWidth: "8rem" }} />
        </Field>

        <Field label="Amount" required>
          <Input name="amount" type="text" required placeholder="0.00" style={{ maxWidth: "14rem" }} />
        </Field>

        <Field label="Vendor (optional)">
          <Select name="vendorPartyId">
            <option value="">— none —</option>
            {vendors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Scope Note" description="Required when kind is MATERIAL_LABOR.">
          <Input name="scopeNote" type="text" />
        </Field>

        <Field label="Notes (optional)">
          <Textarea name="notes" rows={2} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">Create Work Price</Button>
          <Link href="/masterdata/pricing?tab=work" className={buttonClasses("secondary", "md")}>
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
