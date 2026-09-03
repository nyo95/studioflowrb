"use client";

import { useEffect } from "react";

import { Button, EmptyState } from "@/platform/ui_engine";

export default function PlatformError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <EmptyState title="Halaman tidak dapat dimuat" description="Terjadi masalah tak terduga. Coba muat ulang halaman ini." action={<Button variant="primary" onClick={retry}>Coba lagi</Button>} />;
}
