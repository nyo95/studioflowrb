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

const DIALOG_FRAME_CLASSES =
  "fixed z-[51] flex flex-col overflow-hidden rounded-card border border-line bg-surface-raised shadow-elevated animate-ui-dialog-in";
const DIALOG_HEADER_CLASSES = "flex shrink-0 items-start justify-between gap-4 px-4 py-3.5 border-b border-line";
const DIALOG_FOOTER_CLASSES = "flex shrink-0 items-center justify-end gap-4 px-4 py-3.5 border-t border-line";

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
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(28_26_24/0.36)] backdrop-blur-[2px] animate-ui-fade-in" />
        <RDialog.Content
          className={cx(
            DIALOG_FRAME_CLASSES,
            drawer
              ? cx(
                  "top-0 bottom-0 h-full max-h-none [transform:none] rounded-none",
                  side === "right" ? "right-0 left-auto" : "left-0 right-auto",
                  "max-[560px]:w-[min(100%,var(--dialog-width))]",
                )
              : cx(
                  "left-1/2 top-1/2 w-[min(calc(100%-32px),var(--dialog-width))] max-h-(--ui-dialog-max-height) [transform:translate(-50%,-50%)]",
                  "max-[560px]:w-[calc(100%-20px)]",
                ),
          )}
          data-side={drawer ? side : undefined}
          style={{ "--dialog-width": `var(--ui-dialog-${size})` } as CSSProperties}
        >
          <div className={DIALOG_HEADER_CLASSES}>
            <div className="grid gap-[3px]">
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
          <div className="min-h-0 overflow-auto p-4">{children}</div>
          {footer ? <div className={DIALOG_FOOTER_CLASSES}>{footer}</div> : null}
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
        <RAlertDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(28_26_24/0.36)] backdrop-blur-[2px] animate-ui-fade-in" />
        <RAlertDialog.Content
          className={cx(DIALOG_FRAME_CLASSES, "left-1/2 top-1/2 w-[min(calc(100%-32px),var(--dialog-width))] max-h-(--ui-dialog-max-height) [transform:translate(-50%,-50%)] max-[560px]:w-[calc(100%-20px)]")}
          style={{ "--dialog-width": "var(--ui-dialog-sm)" } as CSSProperties}
        >
          <div className="min-h-0 overflow-auto p-4 py-5">
            <div className="grid gap-[3px]">
              <RAlertDialog.Title asChild>
                <Heading level={3}>{title}</Heading>
              </RAlertDialog.Title>
              <RAlertDialog.Description asChild>
                <Text as="p" tone="secondary">{description}</Text>
              </RAlertDialog.Description>
            </div>
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
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
          <RTooltip.Content
            className="z-[70] max-w-[240px] rounded-action bg-ink px-2 py-1.5 text-xs leading-[1.35] text-ink-inverse shadow-elevated"
            side={side}
            sideOffset={6}
          >
            {content}
            <RTooltip.Arrow className="fill-ink" />
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}
