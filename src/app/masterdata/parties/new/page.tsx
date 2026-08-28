import Link from "next/link";
import { redirect } from "next/navigation";

import { PARTY_ROLES, PARTY_TYPES } from "@/apps/masterdata/domain/party-rules";
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
  Select,
  Textarea,
} from "@/platform/ui_engine";
import { createPartyAction } from "../actions";
import { businessTypeService } from "@masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT as CTX } from "@masterdata/infrastructure/request-context";

async function handleCreate(formData: FormData) {
  "use server";
  await createPartyAction(formData);
  redirect("/masterdata/parties");
}

export default async function NewPartyPage() {
  const businessTypes = await businessTypeService.list(CTX);
  return (
    <PageShell>
      <PageHeader eyebrow="Parties" title="New party" />
      <form action={handleCreate}>
        <FormSection title="Identity">
          <Field id="name" label="Name" required>
            <Input id="name" name="name" required autoFocus />
          </Field>
          <Field id="type" label="Type" required>
            <Select id="type" name="type" required>
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field id="legalName" label="Legal name (optional)">
            <Input id="legalName" name="legalName" />
          </Field>
          <Field id="address" label="Address (optional)">
            <Textarea id="address" name="address" rows={2} />
          </Field>
          <Field id="notes" label="Notes (optional)">
            <Textarea id="notes" name="notes" rows={2} />
          </Field>
        </FormSection>
        <FormSection title="Operational roles">
          {PARTY_ROLES.map((role) => (
            <Checkbox key={role} id={`role_${role}`} name={`role_${role}`} label={role} />
          ))}
        </FormSection>
        <FormSection title="Business types" description="Optional commercial classifications; these do not grant supplier/vendor eligibility.">
          {businessTypes.map((type) => <Checkbox key={type.id} id={`business-type-${type.id}`} name="businessTypeIds" value={type.id} label={type.label} />)}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Create party</Button>
          <Link href="/masterdata/parties" className={buttonClasses("secondary")}>Cancel</Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
