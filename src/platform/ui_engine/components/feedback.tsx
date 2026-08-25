import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";
import { Heading, Spinner, type SemanticTone, Text } from "../primitives";

/**
 * Record/row status. Renders a small semantic marker plus a plain-ink label.
 * For chips, tags and counts use `Badge` (pill) instead.
 */
export function StatusBadge({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone: SemanticTone }) {
  return <span className={cx("ui-status", `ui-status-${tone}`, className)} {...props} />;
}

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: SemanticTone;
  title?: ReactNode;
  children?: ReactNode;
};

export function Notice({ tone = "neutral", title, children, className, ...props }: NoticeProps) {
  return (
    <div
      className={cx("ui-notice", `ui-tone-${tone}`, className)}
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
};

function State({
  kind,
  title,
  description,
  action,
  icon: Icon,
  className,
  ...props
}: StateProps & { kind: "loading" | "empty" | "error" }) {
  return (
    <div
      className={cx("ui-state", `ui-state-${kind}`, className)}
      role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined}
      aria-live={kind === "loading" ? "polite" : undefined}
      {...props}
    >
      {kind === "loading" ? <Spinner label={typeof title === "string" ? title : "Loading"} /> : null}
      {kind !== "loading" && Icon ? <Icon className="ui-state-icon" aria-hidden="true" /> : null}
      {title ? <Heading level={4}>{title}</Heading> : null}
      {description ? <Text as="p" tone="secondary">{description}</Text> : null}
      {action ? <div className="ui-state-action">{action}</div> : null}
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
  return <span className={cx("ui-inline-error", className)} role="alert" {...props} />;
}
