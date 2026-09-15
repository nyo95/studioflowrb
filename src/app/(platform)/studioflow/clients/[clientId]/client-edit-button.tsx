"use client";

import { useState } from "react";

import { Button } from "@/platform/ui_engine";

import { ClientDialog } from "../client-directory";

export function ClientEditButton({ client }: { client: { id: string; name: string; address: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Edit client</Button>
      {open ? <ClientDialog client={client} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
