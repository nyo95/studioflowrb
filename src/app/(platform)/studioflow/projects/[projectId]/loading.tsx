import { SectionCard } from "@/platform/ui_engine";

/**
 * Automatic Suspense fallback for this segment's page.tsx (Next.js file
 * convention) — shown only in the content area while project/phase data
 * loads. The layout's own shell (breadcrumb, header, nav) streams in
 * independently and is not covered by this boundary.
 */
function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} />;
}

export default function ProjectOverviewLoading() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <SectionCard padded={false}>
        <div className="grid grid-cols-5 gap-px bg-line-subtle p-px">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid content-start gap-[5px] bg-surface px-3 py-2.5">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-3 w-12" />
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard padded>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-12" />
          </div>
          <SkeletonBlock className="h-8 w-40" />
        </div>
      </SectionCard>
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <SectionCard title="Revision work" padded>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        </SectionCard>
        <SectionCard title="Phase checklist" padded>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
