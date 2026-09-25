import type { HTMLAttributes, ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { cx } from "../internal/cx";
import { Tooltip } from "../layouts/overlays";
import { CountBadge, Heading, type SemanticTone, Surface, Text } from "../primitives";

export type SectionCardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** Visible section heading. Renders a header bar above a hairline. */
  title?: ReactNode;
  /** One-line qualifier under the title, inside the same header bar. */
  description?: ReactNode;
  /** Tooltip content shown on the (?) icon beside the title — same pattern as Field. */
  hint?: ReactNode;
  /** Monospace count rendered beside the title. */
  count?: ReactNode;
  /** Right-aligned affordance in the header bar, typically a link or button. */
  action?: ReactNode;
  /** Padded body for prose and field stacks; flush for full-bleed row lists. */
  padded?: boolean;
};

/**
 * The framed section used everywhere a page groups content on a white surface.
 *
 * When `title` or `action` is supplied the heading sits in its own bar above a
 * hairline, so a section reads as a labelled region rather than a floating
 * card. Without them the card is a plain padded surface, which is what most
 * existing call sites rely on.
 *
 * Row lists pass `padded={false}` so each row's divider reaches the card edge.
 */
export function SectionCard({
  title,
  description,
  hint,
  count,
  action,
  padded = true,
  children,
  className,
  ...props
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || hint || action);
  return (
    /* --ui-card-gutter republishes this card's own --ui-section-px, resolved
       here at the card. A full-bleed child that stamps its own density —
       DataTable sets data-density, and [data-density="compact"] redefines
       --ui-section-px to 12px — otherwise clobbers the gutter for everything
       inside it, so its edge columns landed 4px inboard of the card's title,
       toolbar and footer. Children that must align to the card read this. */
    <Surface as="section" className={cx("min-w-0 overflow-hidden [--ui-card-gutter:var(--ui-section-px)]", className)} {...props}>
      {hasHeader ? (
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-(--ui-section-px) py-2.5">
          <div className="grid min-w-0 gap-[2px]">
            {title ? (
              <div className="flex min-w-0 items-baseline gap-2">
                <Heading level={3} className="truncate">{title}</Heading>
                {count !== undefined && count !== null ? <CountBadge>{count}</CountBadge> : null}
                {hint ? (
                  <Tooltip content={hint}>
                    <button type="button" aria-label="More information" className="inline-flex h-4 w-4 shrink-0 translate-y-[2px] items-center justify-center rounded-full text-ink-tertiary hover:text-ink">
                      <CircleHelp size={14} aria-hidden="true" />
                    </button>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}
            {description ? <Text as="p" tone="secondary" size="sm">{description}</Text> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cx("min-w-0", padded && "px-(--ui-section-px) py-(--ui-section-py)")}>{children}</div>
    </Surface>
  );
}

export type PageSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

/** An unframed run of content under a heading — for stacking on the page itself. */
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
 * the end of the measure. Separates stacked groups without boxing each one.
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
  /** Stable key; also the accessible identity of the list item. */
  id: string;
  label: ReactNode;
  /** One-line qualifier under the label, e.g. "approved 2 Sep". */
  note?: ReactNode;
  /** Monospace trailing detail, e.g. a revision count. */
  detail?: ReactNode;
  state?: PipelineStepState;
  /** Optional domain accent for the leading marker; state remains available through label/note. */
  accentClass?: string;
  href?: string;
  /** Marks this step as the currently viewed tab — renders a bottom border indicator. */
  selected?: boolean;
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
 * A horizontal strip of ordered stages. Cells are separated by a 1px grid gap
 * over the subtle line colour, so the strip reads as one band rather than a
 * row of chips. The current stage is filled and marked `aria-current`, so its
 * position is never carried by colour alone.
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
      className={cx("m-0 grid list-none gap-px bg-line-subtle p-0 max-[720px]:grid-cols-1!", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      {...props}
    >
      {steps.map((step) => {
        const state = step.state ?? "upcoming";
        const body = (
          <>
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-pill", step.accentClass ?? PIPELINE_STATE_DOT_CLASSES[state])} />
              <span className={cx("truncate text-sm font-semibold", step.selected ? "text-ink" : PIPELINE_STATE_LABEL_CLASSES[state])}>
                {step.label}
              </span>
            </div>
            {step.note ? <span className="truncate text-xs text-ink-tertiary">{step.note}</span> : null}
            {step.detail ? <span className="font-ui-mono text-micro text-ink-tertiary">{step.detail}</span> : null}
          </>
        );
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cx(
              "grid min-w-0 content-start gap-[5px] px-3 py-2.5 transition-colors",
              step.selected
                ? "bg-surface shadow-[inset_0_-3px_0_0_theme(colors.ink.DEFAULT)]"
                : state === "current" ? "bg-surface-muted" : "bg-surface",
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
