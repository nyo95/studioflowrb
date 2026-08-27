"use client";

import { useState } from "react";

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
    <div className="ui-stack" style={{ gap: 12 }}>
      <label className="ui-field">
        <span className="ui-label">Workbook</span>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreviewedFile(null); setResult(null); }} />
      </label>
      <div className="ui-cluster">
        <button className="ui-button ui-button--secondary" type="button" disabled={!file || pending} onClick={() => submit("preview")}>Validate & preview</button>
        <button className="ui-button ui-button--primary" type="button" disabled={!file || file !== previewedFile || pending} onClick={() => submit("apply")}>Apply atomically</button>
      </div>
      {result?.safeMessage ? <p role="alert">{result.safeMessage}</p> : null}
      {result?.ok ? <p role="status">{result.changedRows ?? 0} workbook rows validated{previewedFile ? ". Ready to apply." : " and applied."}</p> : null}
      {result?.issues?.length ? <ul>{result.issues.map((issue, index) => <li key={index}>{issue.sheet}{issue.row ? ` row ${issue.row}` : ""}{issue.field ? ` / ${issue.field}` : ""}: {issue.message}</li>)}</ul> : null}
    </div>
  );
}
