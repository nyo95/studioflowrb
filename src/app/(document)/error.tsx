"use client";

import { useEffect } from "react";

import { Button, ErrorState } from "@/platform/ui_engine";

export default function DocumentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <ErrorState title="Dokumen tidak dapat dimuat" description="Terjadi masalah tak terduga. Coba muat ulang halaman ini." action={<Button variant="primary" onClick={retry}>Coba lagi</Button>} />;
}
