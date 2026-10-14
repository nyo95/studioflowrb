"use client";

import { useState } from "react";

import { Button, Dialog, Field, FormActions, InlineError, Input, Text } from "@/platform/ui_engine";

/** Names the Assembly to save from a Work Item. The Work Item itself is not changed. */
export function SaveAsAssemblyDialog({
  initialName,
  lineCount,
  pending,
  error,
  onClose,
  onSave,
}: {
  initialName: string;
  lineCount: number;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const ready = name.trim().length > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Simpan sebagai Assembly"
      description={`${lineCount} Cost Component disalin ke Assembly baru. Work Item ini tidak berubah.`}
      size="sm"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !pending) onSave(name.trim());
        }}
      >
        <Field label="Nama Assembly" required>
          <Input autoFocus value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Text tone="tertiary" size="sm">Harga, jumlah, dan koefisien yang tersimpan sekarang ikut disalin; Assembly tidak terhubung lagi dengan Work Item ini.</Text>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
          <Button type="submit" variant="primary" disabled={!ready || pending} pending={pending}>Simpan Assembly</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
