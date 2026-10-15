"use client";

/* eslint-disable @next/next/no-img-element -- brand mark accepts a local path, an owner-configured host or a signed storage link. */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { areaBrandFor, brandMark, type ShellAreaBrand } from "./brand-rules";

/**
 * The top bar is one 46px line and the app chip beside it already names the application, so the mark stays compact
 * in both rail states: the brand image, or a mono monogram on its own baseline — no chip, no box.
 */
export function ShellBrand({ appTitle, logoUrl, monogram, areas }: { appTitle: string; logoUrl: string | null; monogram: string; areas: readonly ShellAreaBrand[] }) {
  const area = areaBrandFor(usePathname(), areas);
  const url = area ? area.logoUrl : logoUrl;
  const label = area?.name || appTitle;
  return url ? (
    <Link href="/" aria-label={`Open ${appTitle} home`} className="flex items-center rounded-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
      <img src={url} alt={label} className="h-6 w-auto max-w-24 object-contain" />
    </Link>
  ) : (
    <Link href="/" aria-label={`Open ${appTitle} home`} title={area?.name || undefined} className="flex items-center rounded-action px-0.5 font-ui-mono text-xs font-medium tracking-[0.16em] text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
      {area ? brandMark(area.name) || monogram : monogram}
    </Link>
  );
}
