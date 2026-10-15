/** Freehand marks shared by the image tools: points are fractions (0–1) of the surface they are drawn on. */
export type Point = { x: number; y: number };
export type DrawTool = "pen" | "arrow" | "rect" | "ellipse";
export type Stroke = { tool: DrawTool; color: string; points: Point[] };

export const DRAW_TOOLS: { value: DrawTool; label: string }[] = [
  { value: "pen", label: "Pen" },
  { value: "arrow", label: "Arrow" },
  { value: "rect", label: "Box" },
  { value: "ellipse", label: "Circle" },
];

export const STROKE_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#111827"];

/** Draws the marks onto a canvas of `width` × `height`; the same call paints the preview and bakes the saved image. */
export function drawStrokes(context: CanvasRenderingContext2D, strokes: readonly Stroke[], width: number, height: number, lineWidth: number) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length < 1) continue;
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineWidth = lineWidth;
    const px = (point: Point) => point.x * width;
    const py = (point: Point) => point.y * height;
    if (stroke.tool === "pen") {
      if (stroke.points.length < 2) continue;
      context.beginPath();
      context.moveTo(px(stroke.points[0]), py(stroke.points[0]));
      for (const point of stroke.points.slice(1)) context.lineTo(px(point), py(point));
      context.stroke();
      continue;
    }
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    if (stroke.tool === "rect") {
      context.strokeRect(Math.min(px(start), px(end)), Math.min(py(start), py(end)), Math.abs(px(end) - px(start)), Math.abs(py(end) - py(start)));
      continue;
    }
    if (stroke.tool === "ellipse") {
      const cx = (px(start) + px(end)) / 2;
      const cy = (py(start) + py(end)) / 2;
      const rx = Math.abs(px(end) - px(start)) / 2;
      const ry = Math.abs(py(end) - py(start)) / 2;
      context.beginPath();
      context.ellipse(cx, cy, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
      context.stroke();
      continue;
    }
    // arrow
    context.beginPath();
    context.moveTo(px(start), py(start));
    context.lineTo(px(end), py(end));
    context.stroke();
    const angle = Math.atan2(py(end) - py(start), px(end) - px(start));
    const headLength = Math.max(8, lineWidth * 4);
    context.beginPath();
    context.moveTo(px(end), py(end));
    context.lineTo(px(end) - headLength * Math.cos(angle - Math.PI / 6), py(end) - headLength * Math.sin(angle - Math.PI / 6));
    context.lineTo(px(end) - headLength * Math.cos(angle + Math.PI / 6), py(end) - headLength * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
  }
}
