import Link from "next/link";
import { redirect } from "next/navigation";
import { unitService } from "@/apps/masterdata/infrastructure/runtime";
import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import { SKU_KINDS } from "@/apps/masterdata/domain/sku-rules";
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
import { createSkuAction } from "../actions";
import { SkuClassificationFields } from "../sku-classification-fields";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function NewSkuPage() {
  const [units, brands, categories] = await Promise.all([
    unitService.list(CTX),
    brandService.list(CTX),
    categoryService.list(CTX, { kind: "PRODUCT" }),
  ]);

  const liveUnits = units.filter((u) => !u.deletedAt);
  const liveBrands = brands.filter((b) => !b.deletedAt);
  const liveCategories = categories.filter((c) => !c.deletedAt);

  async function handleCreate(formData: FormData) {
    "use server";
    await createSkuAction(formData);
    redirect("/masterdata/skus");
  }

  return (
    <PageShell>
      <PageHeader title="New SKU" description="Add a new material, furniture, or fixture." />

      <form action={handleCreate} className="grid gap-4">
        <Field label="Name" required>
          <Input name="name" type="text" required autoFocus />
        </Field>

        <Field label="Code (optional)" description="Internal reference code. Immutable after creation.">
          <Input name="code" type="text" />
        </Field>

        <Field label="Kind" required>
          <Select name="kind" required>
            {SKU_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Select>
        </Field>

        <Field label="Base Unit" required>
          {liveUnits.length === 0 ? (
            <Text as="p" className="text-warning">No units available. Create units first.</Text>
          ) : (
            <Select name="baseUnitId" required>
              <option value="">— select —</option>
              {liveUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
              ))}
            </Select>
          )}
        </Field>

        <SkuClassificationFields brands={liveBrands.map((brand) => ({ id: brand.id, name: brand.name, categoryIds: brand.categories.map(({ categoryId }) => categoryId) }))} categories={liveCategories.map(({ id, name }) => ({ id, name }))} />

        <Field label="Notes (optional)">
          <Textarea name="notes" rows={3} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">Create SKU</Button>
          <Link href="/masterdata/skus" className={buttonClasses("secondary", "md")}>
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
