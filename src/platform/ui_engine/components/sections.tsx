import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";
import { Heading, Surface, Text } from "../primitives";

export function SectionCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <Surface as="section" className={cx("ui-section-card", className)} {...props} />;
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
    <section className={cx("ui-page-section", className)} {...props}>
      {title || description || action ? (
        <div className="ui-section-header">
          <div className="ui-section-heading">
            {title ? <Heading level={3}>{title}</Heading> : null}
            {description ? <Text as="p" tone="secondary">{description}</Text> : null}
          </div>
          {action ? <div className="ui-section-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
