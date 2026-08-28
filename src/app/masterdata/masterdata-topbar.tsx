import { Bell, Search, UserRound } from "lucide-react";

import { Button, Input } from "@/platform/ui_engine";

export function MasterDataTopbar() {
  const operatorLabel = process.env.NODE_ENV !== "production" ? process.env.MASTERDATA_OPERATOR_LABEL?.trim() : undefined;
  return (
    <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12 }}>
      <form action="/masterdata/brands" method="get" role="search" style={{ flex: "1 1 420px", maxWidth: 520, position: "relative" }}>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }} />
        <Input name="q" type="search" aria-label="Search Brand catalog" placeholder="Search Brand & Catalog" style={{ width: "100%", paddingLeft: 36 }} />
      </form>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <Button variant="ghost" className="w-9 !px-0" disabled aria-label="Notifications unavailable" title="Notifications require the future identity and notification provider"><Bell size={17} aria-hidden="true" /></Button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }} title={operatorLabel ? `Signed in as ${operatorLabel}` : "A local operator must be configured"}>
          <UserRound size={17} aria-hidden="true" />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{operatorLabel ?? "Sign in required"}</span>
        </div>
      </div>
    </div>
  );
}
