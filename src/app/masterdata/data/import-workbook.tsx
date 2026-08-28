"use client";

import { useState } from "react";

import { Button, Field, Input } from "@/platform/ui_engine";

type Result = { ok?: boolean; changedRows?: number; issues?: readonly { sheet: string; row?: number; field?: string; message: string }[]; safeMessage?: string };

export function ImportWorkbook() {
  const [file, setFile] = useState<File | null>(null);
  const [previewedFile, setPreviewedFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(mode: "preview" | "apply") {
    if (!file || (mode === "apply" && file !== previewedFile)) return;
    setPending(true);
    try {
      const body = new FormData(); body.set("workbook", file);
      const response = await fetch(`/masterdata/data/import?mode=${mode}`, { method: "POST", body });
      const next = await response.json() as Result;
      setResult(next);
      if (mode === "preview" && response.ok && next.ok) setPreviewedFile(file);
      if (mode === "apply" && response.ok) setPreviewedFile(null);
    } finally { setPending(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Workbook">
        <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreviewedFile(null); setResult(null); }} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={!file || pending} onClick={() => submit("preview")}>Validate &amp; preview</Button>
        <Button type="button" variant="primary" disabled={!file || file !== previewedFile || pending} onClick={() => submit("apply")}>Apply atomically</Button>
      </div>
      {result?.safeMessage ? <p role="alert">{result.safeMessage}</p> : null}
      {result?.ok ? <p role="status">{result.changedRows ?? 0} workbook rows validated{previewedFile ? ". Ready to apply." : " and applied."}</p> : null}
      {result?.issues?.length ? <ul>{result.issues.map((issue, index) => <li key={index}>{issue.sheet}{issue.row ? ` row ${issue.row}` : ""}{issue.field ? ` / ${issue.field}` : ""}: {issue.message}</li>)}</ul> : null}
    </div>
  );
}
