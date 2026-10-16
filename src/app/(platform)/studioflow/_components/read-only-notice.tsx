import { Notice } from "@/platform/ui_engine";

/** Shown instead of edit controls when the viewer is not assigned to the project (or the phase belongs to the other seat). */
export function ReadOnlyNotice({ scope, className }: { scope: "project" | "phase"; className?: string }) {
  return (
    <Notice className={className} tone="neutral" title="View only">
      {scope === "phase"
        ? "This phase is assigned to someone else. You can read it, but an assigned PIC or manager must make changes."
        : "You can view this section. Only an assigned PIC or manager can make changes."}
    </Notice>
  );
}
