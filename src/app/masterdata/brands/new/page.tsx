import Link from "next/link";
import { redirect } from "next/navigation";

import { categoryService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import {
  Button,
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

const CTX = MASTER_DATA_REQUEST_CONTEXT;

async function handleCreate(formData: FormData) {
  "use server";
  await createBrandAction(formData);
  redirect("/masterdata/brands");
}

export default async function NewBrandPage() {
  const [categories, parties] = await Promise.all([
    categoryService.list(CTX, { kind: "PRODUCT" }),
    partyService.list(CTX, { role: "MATERIAL_SUPPLIER" }),
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
        <FormSection title="PRODUCT categories" description="Select all applicable PRODUCT categories for this brand (required).">
          <Field id="categoryIds" label="Category IDs — one per line" required>
            <Textarea
              id="categoryIds"
              name="categoryIds"
              rows={4}
              required
              placeholder={categories.slice(0, 3).map((c) => c.id).join("\n")}
            />
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
          <Button type="submit" variant="primary" disabled={categories.length === 0}>Create brand</Button>
          <Link href="/masterdata/brands" className="ui-button" data-variant="secondary" data-size="md"><span>Cancel</span></Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
