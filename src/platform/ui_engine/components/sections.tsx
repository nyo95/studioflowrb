import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";
import { Heading, Surface, Text } from "../primitives";

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
