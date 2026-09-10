"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { addSectionAction } from "../actions";
import { Button, Dialog, Field, FormActions, InlineError, Input, Spinner } from "@/platform/ui_engine";

export function AddSectionDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setName("");
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await addSectionAction(null, formData);
      if (result.ok === false) {
        setError(result.error.safeMessage);
        return;
      }
      close();
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>
        Add section
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}
        title="Add section"
        description="Create a section manually, or use a template when a scaffold is available."
        size="sm"
      >
        <form onSubmit={submit} className="grid gap-4">
          {error ? <InlineError>{error}</InlineError> : null}
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Section name" required>
            <Input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. General Works"
              maxLength={160}
              required
              autoFocus
            />
          </Field>
          <FormActions>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Spinner /> : "Add section"}
            </Button>
          </FormActions>
        </form>
      </Dialog>
    </>
  );
}
