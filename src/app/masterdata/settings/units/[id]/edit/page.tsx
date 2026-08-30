import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { unitService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import { UNIT_USAGES } from "@/apps/masterdata/domain/unit-rules";
import {
  Button,
  buttonClasses,
  Checkbox,
  Field,
  FormActions,
  FormSection,
  Input,
  PageHeader,
  PageShell,
  Text,
} from "@/platform/ui_engine";
import { updateUnitAction } from "../../actions";


export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const units = await unitService.list((await requireMasterDataRequestContext()), { includeDeleted: true });
  const unit = units.find((u) => u.id === id);
  if (!unit || unit.deletedAt) notFound();

  async function handleUpdate(formData: FormData) {
    "use server";
    await updateUnitAction(formData);
    redirect("/masterdata/settings/units");
  }

  return (
    <PageShell>
      <PageHeader eyebrow="Units" title={`Edit: ${unit.label}`} />
      <form action={handleUpdate}>
        <input type="hidden" name="id" value={unit.id} />
        <input type="hidden" name="code" value={unit.code} />
        <FormSection title="Identity">
          <Field id="code-display" label="Code">
            <Text as="p" tone="secondary" size="sm">{unit.code} (immutable)</Text>
          </Field>
          <Field id="label" label="Label" required>
            <Input id="label" name="label" defaultValue={unit.label} required autoFocus />
          </Field>
          <Field id="symbol" label="Symbol (optional)">
            <Input id="symbol" name="symbol" defaultValue={unit.symbol ?? ""} />
          </Field>
        </FormSection>
        <FormSection title="Usages">
          {UNIT_USAGES.map((usage) => (
            <Checkbox
              key={usage}
              id={`usage_${usage}`}
              name={`usage_${usage}`}
              label={usage}
              defaultChecked={unit.usages.includes(usage)}
            />
          ))}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Save changes</Button>
          <Link href="/masterdata/settings/units" className={buttonClasses("secondary")}>Cancel</Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
