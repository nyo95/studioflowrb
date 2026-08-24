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

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InvalidProp>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx("ui-control", "ui-input", className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx("ui-control", "ui-textarea", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & InvalidProp
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <span className={cx("ui-select-wrap", className)}>
      <select
        ref={ref}
        className="ui-control ui-select"
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" />
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

export function Checkbox({ id, label, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <label className={cx("ui-choice", className)} htmlFor={controlId}>
      <RCheckbox.Root id={controlId} className="ui-checkbox" {...props}>
        <RCheckbox.Indicator>
          <Check aria-hidden="true" />
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
      className={cx("ui-radio-group", className)}
      aria-label={label}
      data-orientation={orientation}
      {...props}
    >
      {options.map((option) => (
        <label className="ui-choice ui-radio-choice" key={option.value}>
          <RRadioGroup.Item
            className="ui-radio"
            value={option.value}
            disabled={option.disabled}
          >
            <RRadioGroup.Indicator>
              <Circle aria-hidden="true" />
            </RRadioGroup.Indicator>
          </RRadioGroup.Item>
          <span>
            <span className="ui-choice-label">{option.label}</span>
            {option.description ? (
              <span className="ui-choice-description">{option.description}</span>
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
    <label className={cx("ui-choice", className)} htmlFor={controlId}>
      <RSwitch.Root id={controlId} className="ui-switch" {...props}>
        <RSwitch.Thumb className="ui-switch-thumb" />
      </RSwitch.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
