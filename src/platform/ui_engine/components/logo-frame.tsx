"use client";

import { useState } from "react";

import { cx } from "../internal/cx";
import { initialsOf } from "../primitives/display";

export type LogoFrameProps = {
  /** Image URL, or null/empty when there is none. External hosts are allowed; this never optimises or proxies. */
  src?: string | null;
  /** Whose logo it is. Used for the initials fallback and, unless `decorative`, as the image's alt text. */
  name: string;
  /** Text shown when there is no image or it fails to load. Defaults to the initials of `name`. */
  fallback?: string;
  /** True when the name is already printed next to the frame, so the image adds nothing for screen readers. */
  decorative?: boolean;
  /** Box shape; the frame fills its container's width. */
  aspect?: "square" | "4/3" | "16/9";
  /** Inner breathing room around the logo. */
  padding?: "sm" | "md" | "lg";
  rounded?: boolean;
  loading?: "lazy" | "eager";
  className?: string;
};

const ASPECT = { square: "aspect-square", "4/3": "aspect-[4/3]", "16/9": "aspect-[16/9]" } as const;
const PADDING = { sm: "p-2", md: "p-4", lg: "p-6" } as const;

/**
 * A brand or client logo on a neutral plate that reads in light and dark themes.
 *
 * The logo keeps its real colours: no invert, brightness or recolouring, ever. Readability of a white logo on
 * a light plate, or a black one on a dark plate, comes from `--ui-logo-halo`, a hairline drop-shadow on the
 * image's own outline whose colour flips with the theme. Missing or broken images show the initials.
 * Finding the image URL (crawling, choosing an official logo) is app logic and stays in the app.
 */
export function LogoFrame({ src, name, fallback, decorative = false, aspect = "4/3", padding = "lg", rounded = false, loading = "lazy", className }: LogoFrameProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;
  return (
    <div className={cx("relative overflow-hidden bg-surface-muted", ASPECT[aspect], rounded && "rounded-card", className)} data-logo-frame="">
      {showImage ? (
        // External logo hosts are not a fixed image domain, so Next Image optimisation is intentionally skipped.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={decorative ? "" : `${name} logo`}
          loading={loading}
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className={cx("h-full w-full object-contain [filter:var(--ui-logo-halo)]", PADDING[padding])}
        />
      ) : (
        <div role="img" aria-label={`${name}: logo unavailable`} className="grid h-full place-items-center text-ink-tertiary">
          <span className="text-sm font-semibold">{fallback ?? initialsOf(name)}</span>
        </div>
      )}
    </div>
  );
}
