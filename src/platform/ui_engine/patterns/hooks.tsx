"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "../layouts";

type IdentityLike = { id: string };

function mergeOverlayOptions<T extends IdentityLike>(serverOptions: readonly T[], overlayOptions: readonly T[]): readonly T[] {
  const merged = new Map<string, T>();
  for (const option of overlayOptions) {
    merged.set(option.id, option);
  }
  for (const option of serverOptions) {
    merged.set(option.id, option);
  }
  return Array.from(merged.values());
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debounced;
}

export function useOptionOverlay<T extends IdentityLike>(serverOptions: readonly T[]) {
  const [overlayOptions, setOverlayOptions] = useState<readonly T[]>([]);

  const options = useMemo(() => {
    const uncommittedOverlays = overlayOptions.filter(
      (option) => !serverOptions.some((serverOption) => serverOption.id === option.id),
    );
    return mergeOverlayOptions(serverOptions, uncommittedOverlays);
  }, [serverOptions, overlayOptions]);

  const upsertOverlayOption = useCallback((option: T) => {
    setOverlayOptions((current) => mergeOverlayOptions(current, [option]));
  }, []);

  const removeOverlayOption = useCallback((id: string) => {
    setOverlayOptions((current) => current.filter((option) => option.id !== id));
  }, []);

  const clearOverlay = useCallback(() => setOverlayOptions([]), []);

  return { options, upsertOverlayOption, removeOverlayOption, clearOverlay };
}

type ConfirmTone = "primary" | "danger";

export type ConfirmRequest = {
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((nextRequest: ConfirmRequest) => {
    setRequest(nextRequest);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const dialog = request ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      tone={request.tone}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, dialog, open: request !== null };
}

type UnsavedChangesGuardOptions<T> = {
  value: T;
  initialValue: T;
  equals?: (left: T, right: T) => boolean;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function useUnsavedChangesGuard<T>({
  value,
  initialValue,
  equals = Object.is,
  title = "Discard changes?",
  description = "You have unsaved changes. Discard them and continue?",
  confirmLabel = "Discard changes",
  cancelLabel = "Keep editing",
}: UnsavedChangesGuardOptions<T>) {
  const [savedBaseline, setSavedBaseline] = useState<T>(initialValue);
  const [prevInitial, setPrevInitial] = useState<T>(initialValue);

  if (initialValue !== prevInitial) {
    setPrevInitial(initialValue);
    setSavedBaseline(initialValue);
  }

  const isDirty = !equals(value, savedBaseline);
  const confirm = useConfirm();

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const markSaved = useCallback((nextValue: T) => {
    setSavedBaseline(nextValue);
    setPrevInitial(nextValue);
  }, []);

  const requestDiscard = useCallback(
    async (onDiscard?: () => void) => {
      if (!isDirty) {
        onDiscard?.();
        return true;
      }

      const accepted = await confirm.confirm({
        title,
        description,
        confirmLabel,
        cancelLabel,
        tone: "danger",
      });

      if (accepted) {
        setSavedBaseline(value);
        setPrevInitial(value);
        onDiscard?.();
      }
      return accepted;
    },
    [cancelLabel, confirm, confirmLabel, description, isDirty, title, value],
  );

  return {
    isDirty,
    markSaved,
    requestDiscard,
    confirmDialog: confirm.dialog,
  };
}
