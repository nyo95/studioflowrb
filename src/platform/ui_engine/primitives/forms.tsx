"use client";

import {
  Check,
  ChevronDown,
  Circle,
} from "lucide-react";
import { Checkbox as RCheckbox, RadioGroup as RRadioGroup, Switch as RSwitch } from "radix-ui";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cx } from "../internal/cx";

type InvalidProp = { invalid?: boolean };

/**
 * Control density, named to match `DataTable`'s. `compact` is for inline row
 * editors and toolbars; `size` stays the native attribute it already was.
 */
export type ControlDensity = "regular" | "compact";

const CONTROL_DENSITY_CLASSES: Record<ControlDensity, string> = {
  regular: "min-h-(--ui-control-height-md) px-2.5 py-[7px]",
  compact: "min-h-(--ui-control-height-sm) px-2 py-1 text-xs",
};

/* Shared control chrome. Hover/focus/invalid/disabled states mirror the locked
   interaction contract: warm border ladder, soft focus ring, no surprise. */
const CONTROL_CLASSES =
  "w-full rounded-control border border-line bg-surface text-ink transition-[border-color,box-shadow] duration-[120ms] placeholder:text-ink-tertiary enabled:hover:border-line-strong focus:border-line-focus focus:outline-0 focus:shadow-[0_0_0_3px_rgb(87_83_78/0.12)] aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-tertiary";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & InvalidProp & { density?: ControlDensity }
>(
  function Input({ className, invalid, density = "regular", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(CONTROL_CLASSES, CONTROL_DENSITY_CLASSES[density], className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp & { density?: ControlDensity }
>(function Textarea({ className, invalid, density = "regular", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(CONTROL_CLASSES, CONTROL_DENSITY_CLASSES[density], "min-h-[88px] resize-y", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & InvalidProp & { density?: ControlDensity }
>(function Select({ className, invalid, density = "regular", children, ...props }, ref) {
  return (
    <span className={cx("relative block w-full", className)}>
      <select
        ref={ref}
        className={cx(CONTROL_CLASSES, CONTROL_DENSITY_CLASSES[density], "appearance-none", density === "compact" ? "pr-7" : "pr-8")}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-tertiary",
          density === "compact" ? "right-1.5 h-3 w-3" : "right-2.5 h-[15px] w-[15px]",
        )}
      />
    </span>
  );
});

export type CheckboxProps = {
  id?: string;
  label?: ReactNode;
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  disabled?: boolean;
  className?: string;
  name?: string;
  value?: string;
};

const CHOICE_CLASSES =
  "inline-flex items-start gap-[9px] text-ink cursor-pointer has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50";

export function Checkbox({ id, label, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <label className={cx(CHOICE_CLASSES, className)} htmlFor={controlId}>
      <RCheckbox.Root
        id={controlId}
        className="mt-[2px] inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border border-line-strong bg-surface p-0 text-ink-inverse data-[state=checked]:border-action data-[state=checked]:bg-action data-[state=indeterminate]:border-action data-[state=indeterminate]:bg-action"
        {...props}
      >
        <RCheckbox.Indicator>
          <Check aria-hidden="true" className="h-3 w-3 stroke-[3]" />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export type RadioOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export type RadioGroupProps = {
  label: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function RadioGroup({
  label,
  options,
  orientation = "vertical",
  className,
  ...props
}: RadioGroupProps) {
  return (
    <RRadioGroup.Root
      className={cx("flex gap-3", orientation === "vertical" ? "flex-col" : "flex-row flex-wrap", className)}
      aria-label={label}
      {...props}
    >
      {options.map((option) => (
        <label className={CHOICE_CLASSES} key={option.value}>
          <RRadioGroup.Item
            className="mt-[2px] inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface p-0 text-ink-inverse data-[state=checked]:border-action data-[state=checked]:bg-action"
            value={option.value}
            disabled={option.disabled}
          >
            <RRadioGroup.Indicator>
              <Circle aria-hidden="true" className="h-[7px] w-[7px] fill-current stroke-[0]" />
            </RRadioGroup.Indicator>
          </RRadioGroup.Item>
          <span>
            <span className="block font-medium">{option.label}</span>
            {option.description ? (
              <span className="mt-px block text-xs text-ink-secondary">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </RRadioGroup.Root>
  );
}

export type SwitchProps = {
  id?: string;
  label?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  name?: string;
  value?: string;
};

export function Switch({ id, label, className, ...props }: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <label className={cx(CHOICE_CLASSES, className)} htmlFor={controlId}>
      <RSwitch.Root
        id={controlId}
        className="inline-flex h-5 w-[34px] shrink-0 rounded-pill border-0 bg-line-strong p-0.5 data-[state=checked]:bg-action"
        {...props}
      >
        <RSwitch.Thumb className="block h-4 w-4 rounded-full bg-surface transition-transform duration-[120ms] data-[state=checked]:translate-x-[14px]" />
      </RSwitch.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
