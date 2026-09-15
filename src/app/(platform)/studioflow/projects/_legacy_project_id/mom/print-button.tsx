"use client";

import { Button } from "@/platform/ui_engine";

export function PrintButton() {
  return <Button variant="secondary" size="sm" onClick={() => window.print()}>Print</Button>;
}
