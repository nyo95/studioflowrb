"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, Dialog } from "@/platform/ui_engine";
import type { BrandLibraryRead } from "@/apps/masterdata/public";

export function ResourceLinksDialog({ brand }: { brand: BrandLibraryRead }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {brand.name}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={brand.name}
        description={brand.ownerVendor?.name ? `Brand resource · ${brand.ownerVendor.name}` : "Brand resource"}
        size="sm"
        footer={<Button type="button" variant="secondary" onClick={() => setOpen(false)}>Close</Button>}
      >
        {brand.links.length === 0 ? (
          <p className="text-sm text-ink-secondary">No resource links have been added for this brand.</p>
        ) : (
          <div className="grid gap-2">
            {brand.links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm text-action hover:bg-surface-muted"
              >
                <span className="min-w-0 truncate">{link.label || link.kind}</span>
                <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}
