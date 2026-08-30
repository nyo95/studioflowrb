import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Button,
  buttonClasses,
  Field,
  FormActions,
  FormSection,
  Input,
  PageHeader,
  PageShell,
  Textarea,
} from "@/platform/ui_engine";
import { createCategoryAction } from "../actions";

async function handleCreate(formData: FormData) {
  "use server";
  await createCategoryAction(formData);
  redirect("/masterdata/categories?kind=" + (formData.get("kind") ?? "PRODUCT"));
}

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kind = sp["kind"] === "WORK" ? "WORK" : "PRODUCT";

  return (
    <PageShell>
      <PageHeader eyebrow="Categories" title={`New ${kind} category`} />
      <form action={handleCreate}>
        <input type="hidden" name="kind" value={kind} />
        <FormSection title="Details">
          <Field id="name" label="Name" required>
            <Input id="name" name="name" required autoFocus />
          </Field>
          {kind === "WORK" && (
            <Field id="parentId" label="Parent category ID (optional)">
              <Input id="parentId" name="parentId" placeholder="Leave blank for root" />
            </Field>
          )}
          <Field id="description" label="Description">
            <Textarea id="description" name="description" rows={3} />
          </Field>
        </FormSection>
        <FormActions>
          <Button type="submit" variant="primary">Create category</Button>
          <Link
            href={`/masterdata/categories?kind=${kind}`}
            className={buttonClasses("secondary")}
          >
            Cancel
          </Link>
        </FormActions>
      </form>
    </PageShell>
  );
}
