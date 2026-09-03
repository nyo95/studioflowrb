import { Spinner } from "@/platform/ui_engine";

export default function PlatformLoading() {
  return <div className="flex min-h-48 items-center justify-center" role="status"><Spinner decorative /><span className="sr-only">Memuat halaman</span></div>;
}
