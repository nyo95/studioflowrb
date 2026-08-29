import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { businessTypeService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import { PARTY_ROLES, PARTY_TYPES } from "@/apps/masterdata/domain/party-rules";
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
import { updatePartyAction } from "../../actions";


export default async function EditPartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [parties, businessTypes] = await Promise.all([partyService.list((await requireMasterDataRequestContext()), { includeDeleted: true }), businessTypeService.list((await requireMasterDataRequestContext()))]);
  const party = parties.find((p) => p.id === id);
  if (!party || party.deletedAt) notFound();

  async function handleUpdate(formData: FormData) {
    "use server";
    await updatePartyAction(formData);
    redirect("/masterdata/parties");
  }

  return (
    <PageShell>
      <PageHeader eyebrow="Parties" title={`Edit: ${party.name}`} />
      <form action={handleUpdate}>
        <input type="hidden" name="id" value={party.id} />
        <FormSection title="Identity">
          <Field id="name" label="Name" required>
            <Input id="name" name="name" defaultValue={party.name} required autoFocus />
          </Field>
          <Field id="type" label="Type" required>
            <Select id="type" name="type" defaultValue={party.type} required>
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field id="legalName" label="Legal name (optional)">
            <Input id="legalName" name="legalName" defaultValue={party.legalName ?? ""} />
          </Field>
          <Field id="address" label="Address (optional)">
            <Textarea id="address" name="address" rows={2} defaultValue={party.address ?? ""} />
          </Field>
          <Field id="notes" label="Notes (optional)">
            <Textarea id="notes" name="notes" rows={2} defaultValue={party.notes ?? ""} />
          </Field>
        </FormSection>
        <FormSection title="Operational roles">
          {PARTY_ROLES.map((role) => (
            <Checkbox key={role} id={`role_${role}`} name={`role_${role}`} label={role} defaultChecked={party.roles.includes(role)} />
          ))}
        </FormSection>
        <FormSection title="Business types" description="Optional commercial classifications; these do not grant supplier/vendor eligibility.">
          {businessTypes.map((type) => <Checkbox key={type.id} id={`business-type-${type.id}`} name="businessTypeIds" value={type.id} label={type.label} defaultChecked={party.businessTypeIds.includes(type.id)} />)}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Save changes</Button>
          <Link href="/masterdata/parties" className="ui-button" data-variant="secondary" data-size="md"><span>Cancel</span></Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
