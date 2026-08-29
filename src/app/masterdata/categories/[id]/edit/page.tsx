import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import {
  Button,
  Field,
  FormActions,
  FormSection,
  Input,
  PageHeader,
  PageShell,
  Textarea,
} from "@/platform/ui_engine";
import { updateCategoryAction } from "../../actions";


export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const categories = await categoryService.list((await requireMasterDataRequestContext()), { includeDeleted: true });
  const cat = categories.find((c) => c.id === id);
  if (!cat || cat.deletedAt) notFound();

  async function handleUpdate(formData: FormData) {
    "use server";
    await updateCategoryAction(formData);
    redirect(`/masterdata/categories?kind=${cat!.kind}`);
  }

  return (
    <PageShell>
      <PageHeader eyebrow="Categories" title={`Edit: ${cat.name}`} />
      <form action={handleUpdate}>
        <input type="hidden" name="id" value={cat.id} />
        <FormSection title="Details">
          <Field id="name" label="Name" required>
            <Input id="name" name="name" defaultValue={cat.name} required autoFocus />
          </Field>
          <Field id="description" label="Description">
            <Textarea id="description" name="description" rows={3} defaultValue={cat.description ?? ""} />
          </Field>
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Save changes</Button>
          <Link
            href={`/masterdata/categories?kind=${cat.kind}`}
            className="ui-button"
            data-variant="secondary"
            data-size="md"
          >
            <span>Cancel</span>
          </Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
