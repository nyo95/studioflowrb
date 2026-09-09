import { Fragment, type HTMLAttributes, type ReactNode } from "react";

import { cx } from "../internal/cx";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level?: HeadingLevel;
};

/* H1–H2 carry the serif product identity; H3–H6 are sans operational heads. */
const HEADING_LEVEL_CLASSES: Record<HeadingLevel, string> = {
  1: "font-display font-[650] tracking-[-0.025em] text-[2rem]",
  2: "font-display font-[650] tracking-[-0.025em] text-[1.5rem]",
  3: "text-[1.125rem] font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-xs font-semibold",
};

export function Heading({ level = 2, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as keyof Pick<HTMLElementTagNameMap, "h1" | "h2" | "h3" | "h4" | "h5" | "h6">;
  return <Tag className={cx("m-0 leading-[1.2] text-ink", HEADING_LEVEL_CLASSES[level], className)} {...props} />;
}

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: "span" | "p" | "div";
  tone?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md";
  weight?: "regular" | "medium" | "semibold";
  meta?: boolean;
};

const TEXT_TONE_CLASSES = {
  primary: "text-ink",
  secondary: "text-ink-secondary",
  tertiary: "text-ink-tertiary",
} as const;

const TEXT_SIZE_CLASSES = {
  sm: "text-xs",
  md: "text-sm",
} as const;

const TEXT_WEIGHT_CLASSES = {
  regular: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
} as const;

export function Text({
  as: Tag = "span",
  tone = "primary",
  size = "md",
  weight = "regular",
  meta = false,
  className,
  ...props
}: TextProps) {
  return (
    <Tag
      className={cx(
        "m-0",
        TEXT_TONE_CLASSES[tone],
        TEXT_SIZE_CLASSES[size],
        TEXT_WEIGHT_CLASSES[weight],
        meta && "text-[0.6875rem] font-bold tracking-[0.1em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("h-px w-full m-0 border-0 bg-line", className)} {...props} />;
}

export type SemanticTone = "neutral" | "success" | "warning" | "danger";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: SemanticTone }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-[22px] w-fit items-center gap-[5px] rounded-pill border px-2 py-[2px] text-xs font-semibold leading-none",
        tone === "neutral"
          ? "border-line bg-surface-muted text-ink-secondary"
          : tone === "success"
            ? "border-success-line bg-success-surface text-success"
            : tone === "warning"
              ? "border-warning-line bg-warning-surface text-warning"
              : "border-danger-line bg-danger-surface text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block min-h-[12px] rounded-control bg-[linear-gradient(90deg,var(--ui-surface-muted),var(--ui-border-subtle),var(--ui-surface-muted))] bg-[length:200%_100%] animate-ui-skeleton",
        className,
      )}
      {...props}
    />
  );
}

export function Surface({
  as: Tag = "div",
  elevated = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
  elevated?: boolean;
  children?: ReactNode;
}) {
  return (
    <Tag className={cx("bg-surface border border-line rounded-card", elevated && "shadow-elevated", className)} {...props}>
      {children}
    </Tag>
  );
}

/* ── Identity, counts, and measure ──────────────────────────────────────────
   Small display atoms the directory, detail, and worklist templates all reuse:
   an initials avatar for people columns, a monospace count for section heads
   and tab labels, a dot-separated meta line for record identity, and a plain
   measure bar. None of them carry meaning by colour alone. */

export type AvatarSize = "sm" | "md" | "lg";

const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "h-[22px] w-[22px] text-[0.5625rem]",
  md: "h-6 w-6 text-[0.59375rem]",
  lg: "h-[26px] w-[26px] text-[0.625rem]",
};

/** Initials derived from a display name: at most two leading letters. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({
  name,
  size = "md",
  className,
  ...props
}: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & { name: string; size?: AvatarSize }) {
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-pill border border-line bg-surface-muted font-semibold text-ink-secondary",
        AVATAR_SIZE_CLASSES[size],
        className,
      )}
      title={name}
      aria-label={name}
      role="img"
      {...props}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Monospace count used beside section titles and tab labels. */
export function CountBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx("font-ui-mono text-[0.6875rem] font-medium text-ink-tertiary tabular-nums", className)}
      {...props}
    />
  );
}

/** Dot-separated identity line (code · client · area · opened). */
export function MetaList({
  items,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { items: ReactNode[] }) {
  const visible = items.filter((item) => item !== null && item !== undefined && item !== false && item !== "");
  if (visible.length === 0) return null;
  return (
    <div
      className={cx("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-secondary", className)}
      {...props}
    >
      {visible.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden="true" className="text-line-strong">·</span> : null}
          <span className="min-w-0">{item}</span>
        </Fragment>
      ))}
    </div>
  );
}

/** Plain measure bar. `label` is required so the value is never colour-only. */
export function ProgressBar({
  value,
  max = 100,
  label,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { value: number; max?: number; label: string }) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = Math.round((clamped / safeMax) * 100);
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-pill bg-line-subtle", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      {...props}
    >
      <span className="block h-full rounded-pill bg-action" style={{ width: `${percent}%` }} />
    </div>
  );
}

export type SegmentState = "done" | "current" | "idle" | "blocked";

const SEGMENT_STATE_CLASSES: Record<SegmentState, string> = {
  done: "bg-action",
  current: "bg-warning",
  idle: "bg-line",
  blocked: "bg-danger",
};

/**
 * A compact ordered progress bar: one segment per stage, filled by state.
 * It is decorative on its own, so `label` supplies the full reading for
 * assistive technology and the native tooltip.
 */
export function SegmentBar({
  segments,
  label,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { segments: SegmentState[]; label: string }) {
  if (segments.length === 0) return null;
  return (
    <div
      className={cx("flex min-w-16 items-center gap-[3px]", className)}
      role="img"
      aria-label={label}
      title={label}
      {...props}
    >
      {segments.map((state, index) => (
        <span key={index} className={cx("h-[5px] flex-1 rounded-pill", SEGMENT_STATE_CLASSES[state])} />
      ))}
    </div>
  );
}
