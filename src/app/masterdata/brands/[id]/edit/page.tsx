import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { brandService, categoryService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import {
  Button,
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

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

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

  const existingCategoryIds = brand.categories.map((c) => c.categoryId).join("\n");

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
        <FormSection title="PRODUCT categories">
          <Field id="categoryIds" label="Category IDs — one per line" required>
            <Textarea id="categoryIds" name="categoryIds" rows={4} required defaultValue={existingCategoryIds} />
          </Field>
          {categories.length > 0 && (
            <details style={{ marginTop: "0.5rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.875rem", color: "var(--ui-color-text-secondary)" }}>
                Available PRODUCT categories ({categories.length})
              </summary>
              <ul style={{ marginTop: "0.5rem", fontSize: "0.8125rem", listStyle: "none", padding: 0 }}>
                {categories.map((c) => (
                  <li key={c.id} style={{ display: "flex", gap: "0.5rem", padding: "0.125rem 0" }}>
                    <code style={{ fontFamily: "monospace" }}>{c.id}</code>
                    <span>{c.name}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Save changes</Button>
          <Link href="/masterdata/brands" className="ui-button" data-variant="secondary" data-size="md"><span>Cancel</span></Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
