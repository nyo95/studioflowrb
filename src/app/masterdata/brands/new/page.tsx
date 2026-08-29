import Link from "next/link";
import { redirect } from "next/navigation";

import { categoryService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import {
  Button,
  buttonClasses,
  Checkbox,
  Field,
  FormActions,
  FormSection,
  Input,
  Notice,
  PageHeader,
  PageShell,
  Select,
  Textarea,
} from "@/platform/ui_engine";
import { createBrandAction } from "../actions";


async function handleCreate(formData: FormData) {
  "use server";
  await createBrandAction(formData);
  redirect("/masterdata/brands");
}

export default async function NewBrandPage() {
  const [categories, parties] = await Promise.all([
    categoryService.list((await requireMasterDataRequestContext()), { kind: "PRODUCT" }),
    partyService.list((await requireMasterDataRequestContext()), { role: "MATERIAL_SUPPLIER" }),
  ]);

  return (
    <PageShell>
      <PageHeader eyebrow="Brands" title="New brand" description="At least one PRODUCT category is required." />
      {categories.length === 0 && (
        <Notice tone="warning" title="No PRODUCT categories available">
          Create at least one PRODUCT category before creating a Brand.
        </Notice>
      )}
      <form action={handleCreate}>
        <FormSection title="Identity">
          <Field id="name" label="Name" required>
            <Input id="name" name="name" required autoFocus />
          </Field>
          <Field id="ownerPartyId" label="Owner party (optional)">
            <Select id="ownerPartyId" name="ownerPartyId">
              <option value="">— none —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="notes" label="Notes (optional)">
            <Textarea id="notes" name="notes" rows={2} />
          </Field>
        </FormSection>
        <FormSection title="PRODUCT categories" description="Explicit catalog classifications for this Brand. Select at least one.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {categories.map((category) => <Checkbox key={category.id} id={`category-${category.id}`} name="categoryIds" value={category.id} label={category.name} />)}
          </div>
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary" disabled={categories.length === 0}>Create brand</Button>
          <Link href="/masterdata/brands" className={buttonClasses("secondary")}>Cancel</Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
