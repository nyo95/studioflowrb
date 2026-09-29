import Link from "next/link";

import { Button, ErrorState } from "@/platform/ui_engine";

export default function PlatformNotFound() {
  return (
    <ErrorState
      title="Halaman tidak ditemukan"
      description="Item ini mungkin sudah dihapus, atau tautannya sudah tidak berlaku."
      action={
        <Link href="/">
          <Button variant="primary">Kembali ke beranda</Button>
        </Link>
      }
    />
  );
}
