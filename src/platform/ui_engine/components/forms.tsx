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
import { CircleHelp } from "lucide-react";

import { cx } from "../internal/cx";
import { Tooltip } from "../layouts/overlays";
import { Heading, Text } from "../primitives";

type ControlElementProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-required"?: AriaAttributes["aria-required"];
};

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "id"> & {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children?: ReactElement<ControlElementProps>;
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
  const controlId = id ?? (isValidElement(children) ? children.props.id : undefined) ?? `field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        // The asterisk is decorative and hidden, so without this a screen reader
        // never learns the field is required.
        "aria-required": required ? true : children.props["aria-required"],
      })
    : children;

  return (
    <div className={cx("grid min-w-0 gap-[5px]", className)} {...props}>
      {/* The help control sits beside the label, never inside it: a button
          nested in a <label> forwards its click to the labelled control, so
          asking for help toggled the very checkbox or switch being explained. */}
      <div className="inline-flex w-fit items-baseline gap-1">
        <label className="font-semibold text-ink" htmlFor={controlId}>
          {label}
          {required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
        </label>
        {description ? (
          <Tooltip content={description}>
            <button type="button" aria-label="More information" className="inline-flex h-4 w-4 shrink-0 translate-y-[2px] items-center justify-center rounded-full text-ink-tertiary hover:text-ink">
              <CircleHelp size={14} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
      </div>
      {description ? (
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      ) : null}
      {control}
      {error ? (
        <span id={errorId} className="text-xs text-danger" role="alert">
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
    <section className={cx("grid gap-(--ui-section-gap)", className)} {...props}>
      <div className="grid gap-[3px]">
        <Heading level={3}>{title}</Heading>
        {description ? <Text as="p" tone="secondary">{description}</Text> : null}
      </div>
      <div className="grid grid-cols-12 gap-x-4 gap-y-3.5 max-[720px]:[&>*]:col-span-1 max-[720px]:grid-cols-1 [&>*]:col-span-6">
        {children}
      </div>
    </section>
  );
}

const FORM_ACTIONS_ALIGN_CLASSES = {
  start: "justify-start",
  end: "justify-end",
  between: "justify-between",
} as const;

export function FormActions({
  align = "end",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" | "between" }) {
  return (
    <div
      className={cx("flex flex-wrap items-center gap-2 border-t border-line pt-3", FORM_ACTIONS_ALIGN_CLASSES[align], className)}
      data-align={align}
      {...props}
    />
  );
}
