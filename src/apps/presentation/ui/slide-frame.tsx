import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { layoutSpec } from "../layouts";

/*
 * One slide's boxes and the image in each, the same on screen and on paper (owner 2026-10-14, slide layouts). Server-safe:
 * no hooks, so the print page renders it too; the editor passes its handlers.
 *
 * A box is a size container. The image sits in an inner frame with the image's own aspect ratio, sized to cover the box
 * (cropped, placed at its focus) or to fit inside it (whole). Pins are percentages of that frame, so a pin stays on the
 * same spot of the picture whatever the box, crop or paper. An image whose ratio is unknown (older slides) shows whole.
 */

export type FramePin = { id: string; number: number; pinX: number; pinY: number; selected?: boolean };
export type FrameImage = { id: string; slot: number; imageUrl: string | null; imageRatio: number | null; fit: "cover" | "contain"; focusX: number; focusY: number; pins: FramePin[] };

function frameStyle(image: FrameImage): CSSProperties {
  const ratio = image.imageRatio;
  if (!ratio) return { position: "relative", display: "inline-block", maxWidth: "100cqw", maxHeight: "100cqh", lineHeight: 0 };
  if (image.fit === "contain") {
    return { position: "absolute", width: `min(100cqw, calc(100cqh * ${ratio}))`, height: `min(100cqh, calc(100cqw / ${ratio}))`, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  }
  const width = `max(100cqw, calc(100cqh * ${ratio}))`;
  const height = `max(100cqh, calc(100cqw / ${ratio}))`;
  return { position: "absolute", width, height, left: `calc((100cqw - ${width}) * ${image.focusX / 100})`, top: `calc((100cqh - ${height}) * ${image.focusY / 100})` };
}

export function SlideImageBox({ image, pinClassName, onImageClick, onPinClick, children }: {
  image: FrameImage;
  pinClassName: string;
  onImageClick?: (event: ReactMouseEvent<HTMLDivElement>, image: FrameImage) => void;
  onPinClick?: (pinId: string) => void;
  children?: ReactNode;
}) {
  const known = Boolean(image.imageRatio);
  return (
    <div className={known ? "absolute inset-0 overflow-hidden" : "absolute inset-0 grid place-items-center overflow-hidden"} style={{ containerType: "size" }}>
      <div style={frameStyle(image)} onClick={onImageClick ? (event) => onImageClick(event, image) : undefined}>
        {image.imageUrl ? (
          // A short-lived signed URL; next/image optimization would cache it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.imageUrl} alt="" draggable={false} className={known ? "block h-full w-full" : "block h-auto w-auto"} style={known ? undefined : { maxWidth: "100cqw", maxHeight: "100cqh" }} />
        ) : <div className="h-full w-full bg-neutral-200" />}
        {image.pins.map((pin) => (
          onPinClick ? (
            <button key={pin.id} type="button" aria-label={`Pin ${pin.number}`} onClick={(event) => { event.stopPropagation(); onPinClick(pin.id); }} style={{ left: `${pin.pinX}%`, top: `${pin.pinY}%` }} className={`${pinClassName} ${pin.selected ? "ring-2 ring-white outline outline-2 outline-action" : ""}`}>{pin.number}</button>
          ) : (
            <span key={pin.id} style={{ left: `${pin.pinX}%`, top: `${pin.pinY}%` }} className={pinClassName}>{pin.number}</span>
          )
        ))}
      </div>
      {children}
    </div>
  );
}

/** The grid of a layout; `renderBox(slot)` draws each box's content. */
export function SlideGrid({ layout, gap, renderBox }: { layout: string; gap: string; renderBox: (slot: number) => ReactNode }) {
  const spec = layoutSpec(layout);
  return (
    <div className="grid h-full w-full" style={{ gridTemplateColumns: spec.columns, gridTemplateRows: spec.rows, gap }}>
      {spec.boxes.map((box, slot) => (
        <div key={slot} className="relative min-h-0 min-w-0" style={{ gridColumn: box.column, gridRow: box.row }}>{renderBox(slot)}</div>
      ))}
    </div>
  );
}

/** Pins numbered across the slide, box by box, as the legend lists them. */
export function numberPins<A extends { id: string }>(images: readonly { slot: number; annotations: readonly A[] }[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;
  for (const image of [...images].sort((a, b) => a.slot - b.slot)) for (const annotation of image.annotations) numbers.set(annotation.id, next++);
  return numbers;
}
