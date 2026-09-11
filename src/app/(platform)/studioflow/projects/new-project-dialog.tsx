"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { buttonClasses, DraftDialog } from "@/platform/ui_engine";
import { ProjectForm } from "../new/project-form";

type ClientOption = { id: string; name: string };

export function NewProjectButton({ clients }: { clients: ClientOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={buttonClasses("primary", "md")}
        onClick={() => setOpen(true)}
      >
        <Plus size={16} aria-hidden="true" /> New project
      </button>
      <DraftDialog
        open={open}
        onOpenChange={setOpen}
        title="New project"
        description="Phase templates are copied when the project is created."
        size="lg"
      >
        <ProjectForm clients={clients} />
      </DraftDialog>
    </>
  );
}
