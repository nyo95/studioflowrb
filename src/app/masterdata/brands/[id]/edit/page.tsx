import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { brandService, categoryService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import {
  Button,
  Checkbox,
  Field,
  FormActions,
  FormSection,
  Input,
  PageHeader,
  PageShell,
  Select,
  Textarea,
} from "@/platform/ui_engine";
import { updateBrandAction } from "../../actions";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [brands, categories, parties] = await Promise.all([
    brandService.list(CTX, { includeDeleted: true }),
    categoryService.list(CTX, { kind: "PRODUCT" }),
    partyService.list(CTX, { role: "MATERIAL_SUPPLIER" }),
  ]);
  const brand = brands.find((b) => b.id === id);
  if (!brand || brand.deletedAt) notFound();

  async function handleUpdate(formData: FormData) {
    "use server";
    await updateBrandAction(formData);
    redirect("/masterdata/brands");
  }

  const existingCategoryIds = new Set(brand.categories.map((c) => c.categoryId));

  return (
    <PageShell>
      <PageHeader eyebrow="Brands" title={`Edit: ${brand.name}`} />
      <form action={handleUpdate}>
        <input type="hidden" name="id" value={brand.id} />
        <FormSection title="Identity">
          <Field id="name" label="Name" required>
            <Input id="name" name="name" defaultValue={brand.name} required autoFocus />
          </Field>
          <Field id="ownerPartyId" label="Owner party (optional)">
            <Select id="ownerPartyId" name="ownerPartyId" defaultValue={brand.ownerPartyId ?? ""}>
              <option value="">— none —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="notes" label="Notes (optional)">
            <Textarea id="notes" name="notes" rows={2} defaultValue={brand.notes ?? ""} />
          </Field>
        </FormSection>
        <FormSection title="PRODUCT categories" description="Explicit catalog classifications for this Brand. At least one must remain selected.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {categories.map((category) => <Checkbox key={category.id} id={`category-${category.id}`} name="categoryIds" value={category.id} defaultChecked={existingCategoryIds.has(category.id)} label={category.name} />)}
          </div>
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Save changes</Button>
          <Link href="/masterdata/brands" className="ui-button" data-variant="secondary" data-size="md"><span>Cancel</span></Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
