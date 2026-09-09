import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";
import { Heading, Spinner, type SemanticTone, Text } from "../primitives";

/* Status marker. A filled pill per row turns a status column into colour noise;
   a small marker lets the eye scan by colour while the label stays plain ink.
   Meaning is carried by the text, so colour is never the only channel. */
const STATUS_TONE_MARKER_CLASSES: Record<SemanticTone, string> = {
  neutral: "before:bg-ink-tertiary",
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-danger",
};

/**
 * A compact, accessible status signal for records whose name is the primary
 * scan target. Active is circular while archived/error states are squared, so
 * colour is not the only visual signal. The native title exposes the concise
 * text label on hover as well as to assistive technology.
 */
export function StatusMarker({
  tone,
  label,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone: SemanticTone; label: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-2 w-2 shrink-0",
        tone === "success" && "rounded-full",
        tone !== "success" && "rounded-[1px]",
        tone === "success" && "bg-success",
        tone === "warning" && "bg-warning",
        tone === "danger" && "bg-danger",
        tone === "neutral" && "bg-ink-tertiary",
        className,
      )}
      role="img"
      aria-label={label}
      title={label}
      {...props}
    />
  );
}

export function StatusBadge({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone: SemanticTone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[7px] text-ink text-[0.8125rem] leading-[1.3] whitespace-nowrap before:h-[7px] before:w-[7px] before:shrink-0 before:content-[''] before:rounded-[2px]",
        STATUS_TONE_MARKER_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: SemanticTone;
  title?: ReactNode;
  children?: ReactNode;
};

const NOTICE_TONE_CLASSES: Record<SemanticTone, string> = {
  neutral: "border-line bg-surface-muted text-ink-secondary",
  success: "border-success-line bg-success-surface text-success",
  warning: "border-warning-line bg-warning-surface text-warning",
  danger: "border-danger-line bg-danger-surface text-danger",
};

export function Notice({ tone = "neutral", title, children, className, ...props }: NoticeProps) {
  return (
    <div
      className={cx(
        "flex items-start gap-1.5 rounded-control border px-[11px] py-[9px] text-[0.8125rem] [&_strong]:text-inherit",
        NOTICE_TONE_CLASSES[tone],
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      {title ? <strong>{title}</strong> : null}
      {children ? <span>{children}</span> : null}
    </div>
  );
}

type StateProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  /** Monospace reference shown under the actions, e.g. an error or request id. */
  code?: ReactNode;
};

function State({
  kind,
  title,
  description,
  action,
  icon: Icon,
  code,
  className,
  ...props
}: StateProps & { kind: "loading" | "empty" | "error" }) {
  return (
    <div
      className={cx(
        "grid min-h-[156px] place-content-center justify-items-center gap-2 p-6 text-center",
        kind === "error" && "bg-danger-surface text-danger",
        className,
      )}
      role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined}
      aria-live={kind === "loading" ? "polite" : undefined}
      {...props}
    >
      {/* The surrounding State is already the live region; a nested status role
          made assistive tech announce the same loading twice. */}
      {kind === "loading" ? <Spinner decorative /> : null}
      {/* The glyph sits in its own ring so an empty panel reads as a deliberate
          state rather than a view that failed to paint. */}
      {kind !== "loading" && Icon ? (
        <span
          aria-hidden="true"
          className={cx(
            "grid h-9.5 w-9.5 place-items-center rounded-pill border",
            kind === "error" ? "border-danger-line bg-surface text-danger" : "border-line bg-surface-muted text-ink-tertiary",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      {title ? <Heading level={3} className="font-display font-[650]">{title}</Heading> : null}
      {description ? <Text as="p" tone="secondary" className="max-w-100 text-pretty leading-relaxed">{description}</Text> : null}
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      {code ? <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary">{code}</span> : null}
    </div>
  );
}

export function LoadingState({ title = "Loading…", ...props }: Omit<StateProps, "icon">) {
  return <State kind="loading" title={title} {...props} />;
}

export function EmptyState({ icon = Inbox, title = "No records", ...props }: StateProps) {
  return <State kind="empty" icon={icon} title={title} {...props} />;
}

export function ErrorState({ icon = AlertTriangle, title = "Unable to load", ...props }: StateProps) {
  return <State kind="error" icon={icon} title={title} {...props} />;
}

export function InlineError({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("text-xs text-danger", className)} role="alert" {...props} />;
}
