import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level?: HeadingLevel;
};

export function Heading({ level = 2, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as keyof Pick<HTMLElementTagNameMap, "h1" | "h2" | "h3" | "h4" | "h5" | "h6">;
  return <Tag className={cx("ui-heading", `ui-heading-${level}`, className)} {...props} />;
}

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: "span" | "p" | "div";
  tone?: "primary" | "secondary" | "tertiary";
  size?: "sm" | "md";
  weight?: "regular" | "medium" | "semibold";
  meta?: boolean;
};

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
        "ui-text",
        `ui-text-${tone}`,
        `ui-text-${size}`,
        `ui-text-${weight}`,
        meta && "ui-meta",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("ui-divider", className)} {...props} />;
}

export type SemanticTone = "neutral" | "success" | "warning" | "danger";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: SemanticTone }) {
  return <span className={cx("ui-badge", `ui-tone-${tone}`, className)} {...props} />;
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={cx("ui-skeleton", className)} {...props} />;
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
    <Tag className={cx("ui-surface", elevated && "ui-surface-elevated", className)} {...props}>
      {children}
    </Tag>
  );
}
