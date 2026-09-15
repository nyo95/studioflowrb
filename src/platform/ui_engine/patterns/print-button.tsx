"use client";

import { Printer } from "lucide-react";

import { Button, type ButtonProps } from "../primitives/actions";

/** Opens the browser print dialog (print or save as PDF). */
export function PrintButton({ children = "Print / Save PDF", ...props }: Omit<ButtonProps, "onClick">) {
  return (
    <Button variant="primary" size="sm" leadingIcon={<Printer aria-hidden="true" className="h-3.5 w-3.5" />} {...props} onClick={() => window.print()}>
      {children}
    </Button>
  );
}
