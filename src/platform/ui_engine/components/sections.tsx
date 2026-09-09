import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";
import { CountBadge, Heading, type SemanticTone, Surface, Text } from "../primitives";

export function SectionCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <Surface as="section" className={cx("min-w-0 px-(--ui-section-px) py-(--ui-section-py)", className)} {...props} />;
}

export type PageSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function PageSection({
  title,
  description,
  action,
  children,
  className,
  ...props
}: PageSectionProps) {
  return (
    <section className={cx("grid gap-(--ui-section-gap)", className)} {...props}>
      {title || description || action ? (
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-[3px]">
            {title ? <Heading level={3}>{title}</Heading> : null}
            {description ? <Text as="p" tone="secondary">{description}</Text> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type CardSectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  /** Monospace count rendered beside the title. */
  count?: ReactNode;
  /** Right-aligned affordance in the header bar, typically a link out. */
  action?: ReactNode;
  /** Padded body for prose and stacked fields; flush for full-bleed row lists. */
  padded?: boolean;
};

/**
 * A framed section whose title sits in its own header bar above a hairline.
 * Row lists render flush (`padded={false}`) so each row's own divider reaches
 * the card edge; prose and field stacks keep the padded body.
 */
export function CardSection({
  title,
  count,
  action,
  padded = true,
  children,
  className,
  ...props
}: CardSectionProps) {
  return (
    <Surface as="section" className={cx("min-w-0 overflow-hidden", className)} {...props}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-3.5 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {title ? <Heading level={5} className="truncate">{title}</Heading> : null}
            {count !== undefined && count !== null ? <CountBadge>{count}</CountBadge> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cx("min-w-0", padded && "p-3.5")}>{children}</div>
    </Surface>
  );
}

export type GroupHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  count?: ReactNode;
  tone?: SemanticTone;
  action?: ReactNode;
};

const GROUP_HEADER_TONE_CLASSES: Record<SemanticTone, string> = {
  neutral: "text-ink-secondary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * Worklist bucket head: an uppercase label, its count, and a rule that runs to
 * the end of the measure. Used to separate stacked groups without boxing each.
 */
export function GroupHeader({
  title,
  count,
  tone = "neutral",
  action,
  className,
  ...props
}: GroupHeaderProps) {
  return (
    <div className={cx("flex items-baseline gap-2.5", className)} {...props}>
      <Text meta className={GROUP_HEADER_TONE_CLASSES[tone]}>{title}</Text>
      {count !== undefined && count !== null ? <CountBadge>{count}</CountBadge> : null}
      <div aria-hidden="true" className="h-px min-w-4 flex-1 bg-line-subtle" />
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type PipelineStepState = "done" | "current" | "upcoming" | "blocked";

export type PipelineStep = {
  /** Stable key; also used as the accessible list item identity. */
  id: string;
  label: ReactNode;
  /** One-line qualifier under the label, e.g. "approved 2 Sep". */
  note?: ReactNode;
  /** Monospace trailing detail, e.g. a revision number. */
  detail?: ReactNode;
  state?: PipelineStepState;
  href?: string;
};

const PIPELINE_STATE_DOT_CLASSES: Record<PipelineStepState, string> = {
  done: "bg-success",
  current: "bg-warning",
  upcoming: "bg-line-strong",
  blocked: "bg-danger",
};

const PIPELINE_STATE_LABEL_CLASSES: Record<PipelineStepState, string> = {
  done: "text-success",
  current: "text-warning",
  upcoming: "text-ink-tertiary",
  blocked: "text-danger",
};

/**
 * A horizontal strip of ordered stages. Each cell is a hairline-separated
 * column produced by a 1px grid gap over the subtle line colour, so the strip
 * reads as one band rather than a row of chips. The current stage is also
 * filled and marked `aria-current`, so its position is not colour-only.
 */
export function PipelineStrip({
  steps,
  label = "Pipeline",
  className,
  ...props
}: Omit<HTMLAttributes<HTMLOListElement>, "children"> & { steps: PipelineStep[]; label?: string }) {
  if (steps.length === 0) return null;
  return (
    <ol
      aria-label={label}
      className={cx("m-0 grid list-none gap-px bg-line-subtle p-0", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      {...props}
    >
      {steps.map((step) => {
        const state = step.state ?? "upcoming";
        const body = (
          <>
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-pill", PIPELINE_STATE_DOT_CLASSES[state])} />
              <span className={cx("truncate text-[0.78125rem] font-semibold", PIPELINE_STATE_LABEL_CLASSES[state])}>
                {step.label}
              </span>
            </div>
            {step.note ? <span className="truncate text-[0.71875rem] text-ink-tertiary">{step.note}</span> : null}
            {step.detail ? <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary">{step.detail}</span> : null}
          </>
        );
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cx(
              "grid min-w-0 content-start gap-[5px] px-3 py-2.5",
              state === "current" ? "bg-surface-muted" : "bg-surface",
            )}
          >
            {step.href ? (
              <a href={step.href} className="grid min-w-0 gap-[5px] no-underline hover:underline">
                {body}
              </a>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
