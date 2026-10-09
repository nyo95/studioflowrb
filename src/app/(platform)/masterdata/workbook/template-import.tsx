"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";

import { Button, DataTable, InlineError, SectionCard, StatusBadge, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";

export type DownloadFile = { filename: string; mimeType: string; base64: string };
export type CheckSummary = {
  hash: string;
  badges: Array<{ label: string; tone: "success" | "warning" | "neutral" | "danger" }>;
  /** Rows the save would skip; the rest are saved. */
  problems: Array<{ where: string; message: string }>;
  /** Rows that are fine but are not used, with why (a supplier that already exists). Nothing to fix. */
  notes?: Array<{ where: string; message: string }>;
  /** How many rows the save would create or change. */
  changes: number;
  /** True when the file had no data rows at all. */
  empty: boolean;
};

type Busy = "template" | "current" | "check" | "save" | null;

function download(file: DownloadFile) {
  const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The same three steps for every price import: get the plain template (or the current data in the same shape), fill it in and
 * upload it (it is checked at once, saving nothing), then save. Rows with a problem are skipped and listed; the others are saved.
 */
export function TemplateImport({ title, description, limits, canImport, templates, current, extras, options, check, save }: {
  title: string;
  description: string;
  limits: string;
  canImport: boolean;
  /** One button per format. */
  templates: Array<{ label: string; run: () => Promise<ActionResult<DownloadFile>> }>;
  current?: { label: string; run: () => Promise<ActionResult<DownloadFile>> };
  /** More downloads that are not part of the import loop (a printable price list). */
  extras?: Array<{ label: string; run: () => Promise<ActionResult<DownloadFile>> }>;
  /** Extra fields (price kind, default unit). Call `recheck` after one changes so the file is checked again with the new value. */
  options?: (recheck: () => void) => ReactNode;
  check: (file: File) => Promise<ActionResult<CheckSummary>>;
  save: (file: File, hash: string) => Promise<ActionResult<{ message: string }>>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<CheckSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    startTransition(async () => {
      try { await work(); } catch { setError("The action could not be completed. Please try again."); } finally { setBusy(null); }
    });
  };
  const runCheck = (override?: File | null) => {
    const chosen = override ?? file;
    if (!chosen) return;
    run("check", async () => {
      setDone(null);
      const result = await check(chosen);
      if (result.ok === false) { setSummary(null); setError(result.error.safeMessage); return; }
      setSummary(result.data);
    });
  };
  const fetchFile = (kind: "template" | "current", source: () => Promise<ActionResult<DownloadFile>>) => run(kind, async () => {
    const result = await source();
    if (result.ok === false) { setError(result.error.safeMessage); return; }
    download(result.data);
  });

  const canSave = Boolean(file && summary && summary.changes > 0);

  return (
    <SectionCard title={title} description={description} padded>
      <div className="grid gap-5">
        {error ? <InlineError>{error}</InlineError> : null}

        <div className="grid gap-2">
          <Text weight="semibold" size="sm">1. Get the template</Text>
          <div className="flex flex-wrap items-center gap-2">
            {templates.map((template) => (
              <Button key={template.label} variant="primary" pending={busy === "template"} onClick={() => fetchFile("template", template.run)}>{template.label}</Button>
            ))}
            {current ? <Button variant="ghost" pending={busy === "current"} onClick={() => fetchFile("current", current.run)}>{current.label}</Button> : null}
            {(extras ?? []).map((extra) => <Button key={extra.label} variant="ghost" pending={busy === "current"} onClick={() => fetchFile("current", extra.run)}>{extra.label}</Button>)}
          </div>
          <Text tone="tertiary" size="sm">The template is a plain table with one example row; delete that row and fill in yours. The current data comes in the same shape, so you can edit it and upload it back, or copy rows into another workbook.</Text>
        </div>

        {canImport ? (
          <div className="grid gap-2">
            <Text weight="semibold" size="sm">2. Upload your file</Text>
            {options ? <div className="grid gap-3 sm:grid-cols-2">{options(() => runCheck())}</div> : null}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="text-sm"
              aria-label={`${title}: file to upload`}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                setSummary(null);
                setDone(null);
                setError(null);
                if (chosen) runCheck(chosen);
              }}
            />
            <Text tone="tertiary" size="sm">{limits} It is checked as soon as you choose it; nothing is saved yet.</Text>

            {busy === "check" ? <Text tone="secondary" size="sm">Checking the file…</Text> : null}
            {summary ? (
              <div className="mt-1 grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {summary.badges.map((badge) => <StatusBadge key={badge.label} tone={badge.tone}>{badge.label}</StatusBadge>)}
                </div>
                {summary.problems.length > 0 ? (
                  <div className="grid gap-2">
                    <Text tone="secondary" size="sm">These rows have a problem and will be skipped when you save. Fix them in your file and upload it again, or save the rest now. Row numbers are the row numbers in your file.</Text>
                    <DataTable density="compact" minWidth={480}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Where</TableHead>
                          <TableHead>Problem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.problems.map((problem, index) => (
                          <TableRow key={`${problem.where}-${index}`}>
                            <TableCell>{problem.where}</TableCell>
                            <TableCell>{problem.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </DataTable>
                  </div>
                ) : null}
                {summary.notes && summary.notes.length > 0 ? (
                  <div className="grid gap-1">
                    <Text tone="secondary" size="sm">Not used (nothing to fix):</Text>
                    <ul className="grid gap-0.5 text-sm">
                      {summary.notes.map((note, index) => <li key={`${note.where}-${index}`}><Text tone="tertiary" size="sm">{note.where}: {note.message}</Text></li>)}
                    </ul>
                  </div>
                ) : null}
                {summary.changes === 0 ? <Text tone="secondary" size="sm">{summary.empty ? "The file has no data rows." : "Nothing to save. Every valid row matches what is already stored."}</Text> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {canImport ? (
          <div className="grid gap-2">
            <Text weight="semibold" size="sm">3. Save</Text>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                disabled={!canSave}
                pending={busy === "save"}
                onClick={() => run("save", async () => {
                  const result = await save(file!, summary!.hash);
                  if (result.ok === false) { setError(result.error.safeMessage); return; }
                  setDone(result.data.message);
                  setSummary(null);
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                })}
              >
                {summary && summary.changes > 0 ? `Save ${summary.changes} ${summary.changes === 1 ? "row" : "rows"}` : "Save"}
              </Button>
              {!summary && !done ? <Text tone="tertiary" size="sm">Choose a file first.</Text> : null}
              {done ? <StatusBadge tone="success">{done}</StatusBadge> : null}
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
