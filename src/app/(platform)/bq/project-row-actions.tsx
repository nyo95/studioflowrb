"use client";

import { useState, useTransition } from "react";

import { ConfirmDialog, RowActionMenu } from "@/platform/ui_engine";
import { runProjectRowAction } from "./actions";

type ProjectRow = {
  id: string;
  title: string;
  status: "ACTIVE" | "LOCKED" | "ARCHIVED";
};

type Dialog = "lock" | "unlock" | "archive" | "restore" | "delete" | "zero-price";

const COPY: Record<Exclude<Dialog, "zero-price">, { title: string; description: string; confirm: string; danger?: boolean }> = {
  lock: {
    title: "Kunci project ini?",
    description: "Struktur dan angka tidak bisa diubah sampai project dibuka kembali. Harga yang masih kosong harus diisi atau ditandai TBC / By Owner.",
    confirm: "Kunci project",
  },
  unlock: {
    title: "Buka kunci project ini?",
    description: "Project kembali aktif dan struktur maupun angkanya dapat diubah.",
    confirm: "Buka kunci",
  },
  archive: {
    title: "Arsipkan project ini?",
    description: "Project tetap bisa dibaca, tetapi tidak bisa diubah sampai dipulihkan.",
    confirm: "Arsipkan",
    danger: true,
  },
  restore: {
    title: "Pulihkan project ini?",
    description: "Project kembali aktif dan bisa diubah lagi.",
    confirm: "Pulihkan",
  },
  delete: {
    title: "Ajukan penghapusan permanen?",
    description: "Project terarsip tidak langsung dihapus. Permintaan ini harus ditinjau dan disetujui terlebih dahulu.",
    confirm: "Kirim permintaan",
    danger: true,
  },
};

export function ProjectRowActions({ project, deletionPending }: { project: ProjectRow; deletionPending: boolean }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [zeroPriceRows, setZeroPriceRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (next: Dialog) => {
    setError(null);
    setDialog(next);
  };

  const run = (operation: "lock" | "unlock" | "archive" | "restore" | "requestDeletion", acknowledgeZeroPrices = false) => {
    startTransition(async () => {
      const result = await runProjectRowAction(project.id, operation, acknowledgeZeroPrices);
      if (result.ok === false) {
        const count = (result.error.details as { count?: unknown } | undefined)?.count;
        if (operation === "lock" && result.error.code === "bq.project.lock-zero-prices" && typeof count === "number") {
          setZeroPriceRows(count);
          setError(null);
          setDialog("zero-price");
          return;
        }
        setError(result.error.safeMessage);
        return;
      }
      setError(null);
      setDialog(null);
    });
  };

  const items = project.status === "ACTIVE"
    ? [
        { label: "Kunci project", onSelect: () => open("lock") },
        { label: "Arsipkan project", danger: true, separatorBefore: true, onSelect: () => open("archive") },
      ]
    : project.status === "LOCKED"
      ? [{ label: "Buka kunci", onSelect: () => open("unlock") }]
      : [
          { label: "Pulihkan project", onSelect: () => open("restore") },
          ...(deletionPending ? [] : [{ label: "Ajukan penghapusan", danger: true, separatorBefore: true, onSelect: () => open("delete") }]),
        ];

  const standardDialog = dialog && dialog !== "zero-price" ? COPY[dialog] : null;
  const operation = dialog === "delete" ? "requestDeletion" : dialog;

  return (
    <>
      <RowActionMenu label={`Actions for ${project.title}`} pending={pending} items={items} />
      <ConfirmDialog
        open={standardDialog !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen && !pending) setDialog(null); }}
        title={standardDialog?.title ?? "Project action"}
        description={standardDialog?.description}
        confirmLabel={standardDialog?.confirm ?? "Continue"}
        tone={standardDialog?.danger ? "danger" : "primary"}
        pending={pending}
        error={error}
        onConfirm={() => {
          if (operation && operation !== "zero-price") run(operation);
        }}
      />
      <ConfirmDialog
        open={dialog === "zero-price"}
        onOpenChange={(nextOpen) => { if (!nextOpen && !pending) setDialog(null); }}
        title="Kunci dengan harga Rp0?"
        description={`${zeroPriceRows} baris berharga Rp0. Jika memang disengaja, kunci saja. Jika belum, batalkan dan isi harganya dulu.`}
        confirmLabel="Tetap kunci"
        tone="danger"
        pending={pending}
        error={error}
        onConfirm={() => run("lock", true)}
      />
    </>
  );
}
