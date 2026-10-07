"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { buildGanttAxis, ganttBar, ganttMarkerX, type GanttAxis, type GanttZoom } from "@/apps/studioflow/domain/gantt";
import { Text } from "@/platform/ui_engine";

export type GanttBarData = {
  id: string;
  start: string;
  end: string;
  /** A phase accent class such as `bg-[var(--ui-phase-cd)]`. */
  accentClass: string;
  state: "done" | "active" | "pending";
  /** Short text inside the bar when it is wide enough. */
  label?: string;
  title: string;
  onClick?: () => void;
};
export type GanttMarkerData = { id: string; date: string; label: string; tone: "milestone" | "opening" | "warning" };
export type GanttRowData = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  bars: GanttBarData[];
  markers?: GanttMarkerData[];
  /** The project's overall start-to-opening span, drawn as a thin baseline behind the bars. */
  span?: { start: string; end: string } | null;
  trailing?: ReactNode;
  /** Shown in the track when nothing in the row has a date. */
  emptyText?: string;
};

const LABEL_WIDTH = 232;
const ROW_HEIGHT = 48;

const MARKER_TONE: Record<GanttMarkerData["tone"], string> = {
  milestone: "bg-ink",
  opening: "bg-action-primary ring-2 ring-surface",
  warning: "bg-danger",
};

/** Every date a row draws, so the axis can cover all of them. */
export function ganttRowDates(rows: readonly GanttRowData[]): string[] {
  return rows.flatMap((row) => [...row.bars.flatMap((bar) => [bar.start, bar.end]), ...(row.markers ?? []).map((marker) => marker.date), ...(row.span ? [row.span.start, row.span.end] : [])]);
}

/**
 * A calendar Gantt: one shared time axis, one row per project or phase, bars at their real dates,
 * milestone diamonds, weekend shading and a today line. Presentational; the caller decides what a click does.
 */
export function GanttChart({ rows, today, zoom, label }: { rows: GanttRowData[]; today: string; zoom: GanttZoom; label: string }) {
  const axis = useMemo(() => buildGanttAxis(ganttRowDates(rows), { zoom, today }), [rows, zoom, today]);
  const scroller = useRef<HTMLDivElement>(null);
  // Open with today a third of the way in, so the near future is visible without scrolling; re-centre when the zoom changes.
  useEffect(() => {
    const node = scroller.current;
    if (node && axis.todayPx !== null) node.scrollLeft = Math.max(0, axis.todayPx - (node.clientWidth - LABEL_WIDTH) / 3);
  }, [axis.todayPx, axis.zoom]);
  const week = axis.pxPerDay * 7;
  const weekendShade = {
    backgroundImage: `linear-gradient(to right, transparent ${axis.pxPerDay * 5}px, color-mix(in srgb, var(--ui-surface-muted) 55%, transparent) ${axis.pxPerDay * 5}px)`,
    backgroundSize: `${week}px 100%`,
  } as const;

  return (
    <div ref={scroller} className="min-w-0 max-w-full overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <div style={{ width: LABEL_WIDTH + axis.widthPx }} className="relative">
        <AxisHeader axis={axis} />
        {rows.map((row) => (
          <div key={row.id} className="flex border-t border-line" style={{ height: ROW_HEIGHT }}>
            <div className="sticky left-0 z-20 flex shrink-0 items-center justify-between gap-2 border-r border-line bg-surface px-3" style={{ width: LABEL_WIDTH }}>
              <div className="grid min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{row.title}</div>
                {row.subtitle ? <div className="truncate text-micro text-ink-tertiary">{row.subtitle}</div> : null}
              </div>
              {row.trailing}
            </div>
            <div className="relative shrink-0" style={{ width: axis.widthPx, ...weekendShade }}>
              <RowTrack row={row} axis={axis} />
            </div>
          </div>
        ))}
        {axis.todayPx !== null ? (
          <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-danger/70" style={{ left: LABEL_WIDTH + axis.todayPx + axis.pxPerDay / 2 }} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}

function AxisHeader({ axis }: { axis: GanttAxis }) {
  return (
    <div className="flex bg-surface-raised" style={{ height: 40 }}>
      <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-surface-raised" style={{ width: LABEL_WIDTH }} />
      <div className="relative shrink-0" style={{ width: axis.widthPx }}>
        {axis.months.map((month) => (
          <div key={month.key} className="absolute top-0 truncate border-l border-line px-1.5 pt-1 text-micro font-semibold uppercase tracking-[0.06em] text-ink-secondary" style={{ left: month.leftPx, width: month.widthPx }}>
            {month.widthPx > 48 ? month.label : ""}
          </div>
        ))}
        {axis.zoom === "week" ? axis.weeks.map((week) => (
          <div key={week.key} className="absolute bottom-0.5 font-ui-mono text-micro tabular-nums text-ink-tertiary" style={{ left: week.leftPx + 3 }}>{week.label}</div>
        )) : null}
      </div>
    </div>
  );
}

function RowTrack({ row, axis }: { row: GanttRowData; axis: GanttAxis }) {
  const dated = row.bars.length > 0 || (row.markers?.length ?? 0) > 0;
  return (
    <>
      {row.span ? <SpanLine axis={axis} start={row.span.start} end={row.span.end} /> : null}
      {row.bars.map((bar) => {
        const { leftPx, widthPx } = ganttBar(axis, bar.start, bar.end);
        const tone = bar.state === "pending" ? "opacity-45" : bar.state === "done" ? "opacity-100" : "opacity-100 ring-1 ring-ink/30";
        const className = `absolute top-[8px] flex h-6 items-center overflow-hidden rounded-action px-1.5 text-micro font-semibold text-action-ink ${bar.accentClass} ${tone}`;
        const style = { left: leftPx, width: widthPx };
        const content = widthPx > 64 ? <span className="truncate">{bar.label ?? ""}</span> : null;
        return bar.onClick ? (
          <button key={bar.id} type="button" title={bar.title} aria-label={bar.title} style={style} className={`${className} cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-line-focus`} onClick={bar.onClick}>{content}</button>
        ) : (
          <div key={bar.id} title={bar.title} aria-label={bar.title} style={style} className={className}>{content}</div>
        );
      })}
      {(row.markers ?? []).map((marker) => (
        <div key={marker.id} title={`${marker.label} — ${marker.date}`} aria-label={`${marker.label} — ${marker.date}`} className="absolute z-[5] h-3 w-3 rotate-45 rounded-[2px]" style={{ left: ganttMarkerX(axis, marker.date) - 6, top: row.bars.length > 0 ? 34 : 18 }}>
          <div className={`h-full w-full rounded-[2px] ${MARKER_TONE[marker.tone]}`} />
        </div>
      ))}
      {!dated ? <div className="absolute inset-y-0 left-3 flex items-center"><Text size="sm" tone="tertiary">{row.emptyText ?? "No dates yet"}</Text></div> : null}
    </>
  );
}

function SpanLine({ axis, start, end }: { axis: GanttAxis; start: string; end: string }) {
  const { leftPx, widthPx } = ganttBar(axis, start, end);
  return <div className="absolute top-[40px] h-px bg-line-strong" style={{ left: leftPx, width: widthPx }} aria-hidden="true" />;
}
