import { Notice } from "@/platform/ui_engine";

/** Shown instead of edit controls when the viewer is not assigned to the project (or the phase belongs to the other seat). */
export function ReadOnlyNotice({ scope, className }: { scope: "project" | "phase"; className?: string }) {
  return (
    <Notice className={className} tone="neutral" title="View only">
      {scope === "phase"
        ? "This phase belongs to the project's other assigned person, so you can read it but not change it."
        : "Only this project's assigned designer or drafter can change it. You can still read everything."}
    </Notice>
  );
}
