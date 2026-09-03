"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

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
  /** Exact text the operator must type before the confirm control unlocks. */
  requireTypedConfirmation?: string;
};

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((nextRequest: ConfirmRequest) => {
    // A second request supersedes the first. Replacing the resolver without
    // settling it left the earlier caller awaiting a promise that could never
    // resolve — the await simply never returned.
    resolverRef.current?.(false);
    resolverRef.current = null;
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
      requireTypedConfirmation={request.requireTypedConfirmation}
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

type FormDraftGuardOptions = {
  formRef: RefObject<HTMLFormElement | null>;
  /** Changes only when the caller opens a different draft or resets the form. */
  resetKey: string | number;
  /** Controlled values outside native form events, such as a picker or link builder. */
  watchedValue?: string;
  active?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

function serialiseForm(form: HTMLFormElement | null): string {
  if (!form) return "";
  return JSON.stringify(Array.from(new FormData(form).entries()));
}

/** Browser-only draft protection. Apps retain all persistence authority. */
export function useFormDraftGuard({
  formRef,
  resetKey,
  watchedValue = "",
  active = true,
  title,
  description,
  confirmLabel,
  cancelLabel,
}: FormDraftGuardOptions) {
  const [baseline, setBaseline] = useState("");
  const [value, setValue] = useState("");
  const capture = useCallback(() => {
    const next = serialiseForm(formRef.current);
    setBaseline(next);
    setValue(next);
  }, [formRef]);

  useLayoutEffect(() => {
    if (!active) return;
    // This runs after the opening values are mounted but before the browser can
    // process the next user input. A deferred frame could capture the first
    // keystroke as the baseline and silently lose the discard warning.
    capture();
  }, [active, capture, resetKey]);

  const sync = useCallback(() => setValue(serialiseForm(formRef.current)), [formRef]);
  useEffect(() => {
    if (active) sync();
  }, [active, sync, watchedValue]);

  const guard = useUnsavedChangesGuard({ value, initialValue: baseline, title, description, confirmLabel, cancelLabel });
  const requestDiscard = useCallback(
    (onDiscard?: () => void) => guard.requestDiscard(onDiscard, serialiseForm(formRef.current)),
    [formRef, guard],
  );
  return { ...guard, requestDiscard, onFormChange: sync, capture, markSaved: capture };
}

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

  // Compare with the caller's comparator, not reference identity. A form that
  // rebuilds its initial object each render moved the baseline every render, so
  // the guard never saw a dirty form and never prompted.
  if (!equals(initialValue, prevInitial)) {
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
    async (onDiscard?: () => void, currentValue: T = value) => {
      const currentIsDirty = !equals(currentValue, savedBaseline);
      if (!currentIsDirty) {
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
        setSavedBaseline(currentValue);
        setPrevInitial(currentValue);
        onDiscard?.();
      }
      return accepted;
    },
    [cancelLabel, confirm, confirmLabel, description, equals, savedBaseline, title, value],
  );

  return {
    isDirty,
    markSaved,
    requestDiscard,
    confirmDialog: confirm.dialog,
  };
}
