"use client";

import { X } from "lucide-react";
import { AlertDialog as RAlertDialog,Dialog as RDialog,Tooltip as RTooltip } from "radix-ui";
import { cloneElement,isValidElement,useId,useState,type CSSProperties,type ReactElement,type ReactNode } from "react";

import { cx } from "../internal/cx";
import { Button,Heading,IconButton,Input,Text } from "../primitives";

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
  /**
   * Set false to refuse Escape, outside-click, and the close control. Use it
   * while a submit is in flight, so a half-written record is not dismissed by a
   * stray click. The engine owns the refusal; deciding when to refuse is the
   * app's. Never leave it false with no visible way out.
   */
  dismissible?: boolean;
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
  dismissible = true,
}: DialogProps & { drawer?: boolean; side?: "left" | "right" }) {
  const blockDismiss = (event: { preventDefault: () => void }) => {
    if (!dismissible) event.preventDefault();
  };
  return (
    <RDialog.Root open={open} onOpenChange={(next) => { if (next || dismissible) onOpenChange(next); }}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(28_26_24/0.36)] backdrop-blur-[2px] animate-ui-fade-in" />
        <RDialog.Content
          className={cx(
            DIALOG_FRAME_CLASSES,
            drawer
              ? cx(
                  // The size token has to reach the drawer too: without a width
                  // here the panel shrank to its content on every desktop
                  // viewport and the size prop did nothing.
                  "top-0 bottom-0 h-full w-[min(100%,var(--dialog-width))] max-h-none [transform:none] rounded-none",
                  side === "right" ? "right-0 left-auto" : "left-0 right-auto",
                )
              : cx(
                  "left-1/2 top-1/2 w-[min(calc(100%-32px),var(--dialog-width))] max-h-(--ui-dialog-max-height) [transform:translate(-50%,-50%)]",
                  "max-[560px]:w-[calc(100%-20px)]",
                ),
          )}
          data-side={drawer ? side : undefined}
          data-dismissible={dismissible ? undefined : "false"}
          style={{ "--dialog-width": `var(--ui-dialog-${size})` } as CSSProperties}
          onEscapeKeyDown={blockDismiss}
          onPointerDownOutside={blockDismiss}
          onInteractOutside={blockDismiss}
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
                disabled={!dismissible}
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
  error?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "primary" | "danger";
  /**
   * Exact text the operator must type before confirming. Reserve it for the
   * irreversible: an extra sentence to read is a weaker guard than an extra
   * sentence to type. The engine owns the field, the exact comparison, and the
   * disabled state; the app owns which word is worth typing.
   */
  requireTypedConfirmation?: string;
  /** Prompt above the field. Receives the expected text. */
  typedConfirmationLabel?: (expected: string) => ReactNode;
};

export function ConfirmDialog({
  error,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  pending = false,
  tone = "primary",
  requireTypedConfirmation,
  typedConfirmationLabel = (expected) => <>Type <strong>{expected}</strong> to confirm.</>,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const typedFieldId = useId();

  // A reopened dialog must not inherit the previous answer. Adjusted during
  // render rather than in an effect, so no extra pass is scheduled.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setTyped("");
  }

  const typedSatisfied = !requireTypedConfirmation || typed === requireTypedConfirmation;

  return (
    <RAlertDialog.Root open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
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
            {error ? <div role="alert" className="mt-3 text-sm text-danger">{error}</div> : null}
            {requireTypedConfirmation ? (
              <div className="mt-3.5 grid gap-[5px]">
                <label className="font-semibold text-ink" htmlFor={typedFieldId}>
                  {typedConfirmationLabel(requireTypedConfirmation)}
                </label>
                <Input
                  id={typedFieldId}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={pending}
                />
              </div>
            ) : null}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            <RAlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>{cancelLabel}</Button>
            </RAlertDialog.Cancel>
            <RAlertDialog.Action asChild>
              <Button
                variant={tone === "danger" ? "danger-primary" : "primary"}
                pending={pending}
                disabled={!typedSatisfied}
                onClick={(event) => {
                  event.preventDefault();
                  if (!typedSatisfied) {
                    event.preventDefault();
                    return;
                  }
                  onConfirm();
                }}
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
  children: ReactElement<{ title?: string }>;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
};

export function Tooltip({ content, children, side = "top", delayDuration = 350 }: TooltipProps) {
  // A child carrying its own `title` would show the browser's tooltip alongside
  // this one — two panels for one control, and the name announced twice. This
  // tooltip supersedes it, so it suppresses the native one. An empty title is
  // the suppression idiom: `undefined` would only re-enable a child's own
  // fallback, which is exactly what IconButton does with its label.
  const trigger = isValidElement(children) ? cloneElement(children, { title: "" }) : children;
  return (
    <RTooltip.Provider delayDuration={delayDuration}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{trigger}</RTooltip.Trigger>
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
