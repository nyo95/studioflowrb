"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { buttonClasses, DraftDialog } from "@/platform/ui_engine";
import type { BqTemplateRead } from "@/apps/bq/public";
import { ProjectForm } from "./project-form";

export function NewProjectButton({ templates }: { templates: BqTemplateRead[] }) {
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
        title="Buat Project BQ"
        description="Mulai BQ baru; struktur Section/Subsection dapat ditambahkan setelah project dibuat."
        size="md"
      >
        <ProjectForm templates={templates} />
      </DraftDialog>
    </>
  );
}
