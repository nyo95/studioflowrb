"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";

import { IconButton } from "../primitives/actions";

export type CopyButtonProps = {
  /** The text value to copy to the clipboard. */
  value: string;
  /** Accessible label for the button in its idle state. */
  label: string;
  /** Accessible label shown briefly after a successful copy. Defaults to "Copied". */
  successLabel?: string;
  /** Accessible label shown briefly after a failed copy. Defaults to "Copy failed". */
  failureLabel?: string;
};

/**
 * An icon button that copies a value to the clipboard.
 * No toast, no persistence, no business defaults — those belong to the caller.
 */
export function CopyButton({
  value,
  label,
  successLabel = "Copied",
  failureLabel = "Copy failed",
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "success" | "failure">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function handleClick() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("success");
    } catch {
      setState("failure");
    }
    resetTimer.current = setTimeout(() => {
      resetTimer.current = null;
      setState("idle");
    }, 2000);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <IconButton
        size="sm"
        variant="ghost"
        label={label}
        icon={
          state === "success"
            ? <Check size={14} aria-hidden="true" />
            : state === "failure"
            ? <AlertCircle size={14} aria-hidden="true" />
            : <Copy size={14} aria-hidden="true" />
        }
        onClick={handleClick}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {state === "success" ? successLabel : state === "failure" ? failureLabel : ""}
      </span>
    </span>
  );
}
