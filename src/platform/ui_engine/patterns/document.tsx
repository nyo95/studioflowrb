import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

export const printOnlyClassName = "ui-print-only";
export const screenOnlyClassName = "ui-screen-only";

export type DocumentSheetProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: "a4" | "letter";
};

export function DocumentSheet({
  title,
  header,
  footer,
  children,
  size = "a4",
  className,
  ...props
}: DocumentSheetProps) {
  return (
    <article className={cx("ui-document-sheet", className)} data-size={size} {...props}>
      {header || title ? (
        <header className="ui-document-header">
          {header}
          {title ? <h2>{title}</h2> : null}
        </header>
      ) : null}
      <div className="ui-document-body">{children}</div>
      {footer ? <footer className="ui-document-footer">{footer}</footer> : null}
    </article>
  );
}
