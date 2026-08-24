"use client";

import { X } from "lucide-react";
import { AlertDialog as RAlertDialog, Dialog as RDialog, Tooltip as RTooltip } from "radix-ui";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { cx } from "../internal/cx";
import { Button, Heading, IconButton, Text } from "../primitives";

export type OverlaySize = "sm" | "md" | "lg" | "xl" | "full";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: OverlaySize;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
};

function DialogFrame({
  drawer = false,
  side = "right",
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
  closeLabel = "Close",
}: DialogProps & { drawer?: boolean; side?: "left" | "right" }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="ui-overlay" />
        <RDialog.Content
          className={cx("ui-dialog", drawer && "ui-drawer")}
          data-side={drawer ? side : undefined}
          style={{ "--dialog-width": `var(--ui-dialog-${size})` } as CSSProperties}
        >
          <div className="ui-dialog-header">
            <div className="ui-section-heading">
              <RDialog.Title asChild>
                <Heading level={3}>{title}</Heading>
              </RDialog.Title>
              {description ? (
                <RDialog.Description asChild>
                  <Text as="p" tone="secondary">{description}</Text>
                </RDialog.Description>
              ) : null}
            </div>
            <RDialog.Close asChild>
              <IconButton
                size="sm"
                variant="ghost"
                label={closeLabel}
                icon={<X aria-hidden="true" />}
              />
            </RDialog.Close>
          </div>
          <div className="ui-dialog-body">{children}</div>
          {footer ? <div className="ui-dialog-footer">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Dialog(props: DialogProps) {
  return <DialogFrame {...props} />;
}

export function Drawer(props: DialogProps & { side?: "left" | "right" }) {
  return <DialogFrame {...props} drawer />;
}

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "primary" | "danger";
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  pending = false,
  tone = "primary",
}: ConfirmDialogProps) {
  return (
    <RAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <RAlertDialog.Portal>
        <RAlertDialog.Overlay className="ui-overlay" />
        <RAlertDialog.Content
          className="ui-dialog"
          style={{ "--dialog-width": "var(--ui-dialog-sm)" } as CSSProperties}
        >
          <div className="ui-dialog-body ui-confirm-body">
            <div className="ui-section-heading">
              <RAlertDialog.Title asChild>
                <Heading level={3}>{title}</Heading>
              </RAlertDialog.Title>
              <RAlertDialog.Description asChild>
                <Text as="p" tone="secondary">{description}</Text>
              </RAlertDialog.Description>
            </div>
          </div>
          <div className="ui-dialog-footer">
            <RAlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>{cancelLabel}</Button>
            </RAlertDialog.Cancel>
            <RAlertDialog.Action asChild>
              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                pending={pending}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </RAlertDialog.Action>
          </div>
        </RAlertDialog.Content>
      </RAlertDialog.Portal>
    </RAlertDialog.Root>
  );
}

export type TooltipProps = {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
};

export function Tooltip({ content, children, side = "top", delayDuration = 350 }: TooltipProps) {
  return (
    <RTooltip.Provider delayDuration={delayDuration}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content className="ui-tooltip" side={side} sideOffset={6}>
            {content}
            <RTooltip.Arrow className="ui-tooltip-arrow" />
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
