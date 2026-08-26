import Link from "next/link";
import { redirect } from "next/navigation";

import { UNIT_USAGES } from "@/apps/masterdata/domain/unit-rules";
import {
  Button,
  Checkbox,
  Field,
  FormActions,
  FormSection,
  Input,
  PageHeader,
  PageShell,
} from "@/platform/ui_engine";
import { createUnitAction } from "../actions";

async function handleCreate(formData: FormData) {
  "use server";
  await createUnitAction(formData);
  redirect("/masterdata/settings/units");
}

export default function NewUnitPage() {
  return (
    <PageShell>
      <PageHeader eyebrow="Units" title="New unit" />
      <form action={handleCreate}>
        <FormSection title="Identity">
          <Field id="code" label="Code" required>
            <Input id="code" name="code" required autoFocus />
          </Field>
          <Field id="label" label="Label" required>
            <Input id="label" name="label" required />
          </Field>
          <Field id="symbol" label="Symbol (optional)">
            <Input id="symbol" name="symbol" />
          </Field>
        </FormSection>
        <FormSection title="Usages">
          {UNIT_USAGES.map((usage) => (
            <Checkbox key={usage} id={`usage_${usage}`} name={`usage_${usage}`} label={usage} />
          ))}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Create unit</Button>
          <Link href="/masterdata/settings/units" className="ui-button" data-variant="secondary" data-size="md"><span>Cancel</span></Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
