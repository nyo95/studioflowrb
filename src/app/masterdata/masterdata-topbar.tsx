import { Search } from "lucide-react";

import { Input } from "@/platform/ui_engine";

export function MasterDataTopbar() {
  return (
    <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12 }}>
      <form action="/masterdata/brands" method="get" role="search" style={{ flex: "1 1 420px", maxWidth: 520, position: "relative" }}>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }} />
        <Input name="q" type="search" aria-label="Search Brand catalog" placeholder="Search Brand & Catalog" style={{ width: "100%", paddingLeft: 36 }} />
      </form>
    </div>
  );
}
