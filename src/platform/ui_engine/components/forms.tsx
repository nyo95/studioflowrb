"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type AriaAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { cx } from "../internal/cx";
import { Heading, Text } from "../primitives";

type ControlElementProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
};

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "id"> & {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<ControlElementProps>;
};

export function Field({
  id,
  label,
  description,
  error,
  required = false,
  children,
  className,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? children.props.id ?? `field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })
    : children;

  return (
    <div className={cx("ui-field", className)} {...props}>
      <label className="ui-field-label" htmlFor={controlId}>
        {label}
        {required ? <span className="ui-field-required" aria-hidden="true">*</span> : null}
      </label>
      {description ? (
        <Text id={descriptionId} tone="secondary" size="sm">
          {description}
        </Text>
      ) : null}
      {control}
      {error ? (
        <span id={errorId} className="ui-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type FormSectionProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

export function FormSection({ title, description, children, className, ...props }: FormSectionProps) {
  return (
    <section className={cx("ui-form-section", className)} {...props}>
      <div className="ui-section-heading">
        <Heading level={3}>{title}</Heading>
        {description ? <Text as="p" tone="secondary">{description}</Text> : null}
      </div>
      <div className="ui-form-grid">{children}</div>
    </section>
  );
}

export function FormActions({
  align = "end",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" | "between" }) {
  return <div className={cx("ui-form-actions", className)} data-align={align} {...props} />;
}
