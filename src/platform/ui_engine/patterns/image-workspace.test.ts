import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it, type TestContext } from "node:test";
import ts from "typescript";
import * as adjustments from "./image-adjust";
import * as geometry from "./image-crop";
import * as strokes from "./image-strokes";

type Props = Record<string, unknown>;
type Element = { type: string; props: Props };
type Effect = { deps: unknown[]; cleanup?: () => void };
type Options = { aspect?: number; disabled?: boolean; outputType?: string; outputQuality?: number; maxDimension?: number; maxBytes?: number; targetBytes?: number; onPrepared?: (file: File) => Promise<void>; initialFile?: File | null; openOnMount?: boolean; pasteFromPage?: boolean };
const source = readFileSync(new URL("./image-workspace.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const element = (value: unknown): value is Element => !!value && typeof value === "object" && "props" in value;
const text = (value: unknown): string => Array.isArray(value) ? value.map(text).join("") : element(value) ? text(value.props.children) : typeof value === "string" ? value : "";
const call = (node: Element, name: string, ...args: unknown[]) => (node.props[name] as (...values: unknown[]) => unknown)(...args);

/** Execute real component handlers with deterministic hooks/canvas ports; browser rendering remains Reviewer-owned. */
function workspace(t: TestContext, options: Options = {}, cropRect = geometry.cropRect) {
  const slots: unknown[] = [];
  let cursor = 0, tree: Element, effects: Array<() => void> = [];
  let props = { label: "Fixture", aspect: 4 / 3, initialFile: new File(["fixture"], "source.png", { type: "image/png" }), ...options };
  let intake: Props = {};
  const files: File[] = [], revoked: string[] = [];
  const encodes: Array<{ width: number; height: number; type: string; quality: number }> = [];
  const captures = new Set<number>();
  const listeners = new Map<string, (event: unknown) => void>();
  let bounds = { left: 10, top: 20, width: 400, height: 300 };
  const traceContext = () => {
    const commands: unknown[][] = [];
    const context: Props = { commands };
    for (const name of ["scale", "clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "strokeRect", "ellipse", "closePath", "fill"]) {
      context[name] = (...args: unknown[]) => commands.push([name, ...args]);
    }
    context.drawImage = (_image: unknown, ...args: unknown[]) => commands.push(["drawImage", ...args]);
    return context;
  };
  const overlayContext = traceContext();
  const overlay = { getContext: () => overlayContext, getBoundingClientRect: () => bounds, setPointerCapture: (id: number) => captures.add(id), hasPointerCapture: (id: number) => captures.has(id), releasePointerCapture: (id: number) => captures.delete(id) };
  const image = { naturalWidth: 1600, naturalHeight: 900 };
  let pickerClicks = 0;
  const picker = { click: () => pickerClicks++ };
  const viewport = { getBoundingClientRect: () => bounds, addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler), removeEventListener: (name: string) => listeners.delete(name) };
  const globals = globalThis as unknown as Props;
  const replaceGlobal = (name: string, value: unknown) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globals, name); });
  };
  replaceGlobal("window", { devicePixelRatio: 1 });
  replaceGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  replaceGlobal("document", { createElement: () => {
    const context = traceContext();
    const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (done: (blob: Blob) => void, type: string, quality: number) => {
      encodes.push({ width: canvas.width, height: canvas.height, type, quality });
      done(new Blob([JSON.stringify({ width: canvas.width, height: canvas.height, commands: context.commands, type, quality })], { type }));
    } };
    return canvas;
  } });
  let objectUrl = 0;
  t.mock.method(URL, "createObjectURL", () => `blob:fixture-${objectUrl++}`);
  t.mock.method(URL, "revokeObjectURL", (url: string) => revoked.push(url));
  const changed = (before: unknown[], after: unknown[]) => before.length !== after.length || before.some((value, index) => !Object.is(value, after[index]));
  const react = {
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback: (fn: unknown, deps: unknown[]) => { const index = cursor++; const old = slots[index] as { deps: unknown[]; fn: unknown } | undefined; if (!old || changed(old.deps, deps)) slots[index] = { deps, fn }; return (slots[index] as { fn: unknown }).fn; },
    useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
      const index = cursor++, old = slots[index] as Effect | undefined;
      if (!old || changed(old.deps, deps)) effects.push(() => { old?.cleanup?.(); slots[index] = { deps, cleanup: fn() } as Effect; });
    },
  };
  const dependencies: Props = {
    react, "react/jsx-runtime": { jsx: (type: string, props: Props) => ({ type, props }), jsxs: (type: string, props: Props) => ({ type, props }) },
    "next/image": { default: "img" }, "../primitives/actions": { Button: "button" }, "../primitives/forms": { Input: "input" },
    "./file-intake": { useFileIntake: (value: Props) => { intake = value; return { active: false, target: {} }; } },
    "./image-adjust": adjustments, "./image-crop": { ...geometry, cropRect }, "./image-strokes": strokes,
  };
  const exports = {} as { ImageWorkspace: (props: Props) => Element };
  new Function("require", "exports", compiled)((name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  function descendants(value: unknown): Element[] { return Array.isArray(value) ? value.flatMap(descendants) : element(value) ? [value, ...descendants(value.props.children)] : []; }
  const all = (value: unknown = tree) => descendants(value);
  function render() {
    cursor = 0; effects = [];
    tree = exports.ImageWorkspace({ ...props, onPrepared: async (file: File) => { files.push(file); await options.onPrepared?.(file); } });
    for (const node of all()) {
      if (!node.props.ref) continue;
      (node.props.ref as { current: unknown }).current = node.type === "canvas" ? overlay : node.type === "img" ? image : node.type === "input" ? picker : viewport;
      if (node.props.ref && node.type === "div") bounds = { ...bounds, height: bounds.width / Number((node.props.style as Props).aspectRatio) };
    }
    for (const effect of effects) effect();
  }
  const find = (predicate: (node: Element) => boolean) => { const node = all().find(predicate); assert.ok(node); return node; };
  const button = (label: string) => find((node) => node.type === "button" && text(node) === label);
  const click = (label: string) => { const node = button(label); if (!node.props.disabled && !node.props.pending) call(node, "onClick"); render(); };
  const range = (label: string) => { const row = find((node) => node.type === "label" && text(node) === label); return all(row).find((node) => node.type === "input")!; };
  const change = (label: string, value: number) => { call(range(label), "onChange", { target: { value: String(value) } }); render(); };
  const load = () => { call(find((node) => node.type === "img"), "onLoad", { currentTarget: image }); render(); };
  const pointer = (handler: string, id: number, x: number, y: number) => { call(find((node) => node.type === "canvas"), handler, { pointerId: id, pointerType: "touch", button: 0, clientX: x + bounds.left, clientY: y + bounds.top, currentTarget: overlay, preventDefault() {} }); render(); };
  const save = async () => { await call(button("Use prepared image"), "onClick"); render(); return files.at(-1)!; };
  const commands = async () => JSON.parse(await (await save()).text()).commands as unknown[][];
  render();
  t.after(() => { for (const slot of slots) (slot as Effect | null)?.cleanup?.(); });
  return { render, load, click, change, range, pointer, save, commands, button, all, captures, files, revoked, encodes, image, listeners, pickerClicks: () => pickerClicks, intake: () => intake, setDisabled: (disabled: boolean) => { props = { ...props, disabled }; render(); } };
}

it("starts in Pan, preserves completed strokes across tools, and undo/clear/new-file affect only their intended state", async (t) => {
  const ui = workspace(t); ui.load();
  assert.equal(ui.button("Pan").props["aria-pressed"], true);
  assert.equal(ui.button("Reset crop").props.disabled, true);
  const draw = (id: number) => { ui.pointer("onPointerDown", id, 50, 50); ui.pointer("onPointerMove", id, 150, 150); ui.pointer("onPointerUp", id, 150, 150); };
  ui.click("Pen"); draw(1); draw(2);
  ui.click("Pan"); ui.click("Arrow");
  assert.equal((await ui.commands()).filter((command) => command[0] === "stroke").length, 2);
  ui.click("Undo last stroke");
  assert.equal((await ui.commands()).filter((command) => command[0] === "stroke").length, 1);
  ui.click("Clear annotations"); assert.equal(ui.button("Undo last stroke").props.disabled, true);
  ui.change("Crop zoom", 2); ui.change("Horizontal focus", 0); ui.click("Reset crop");
  assert.deepEqual([ui.range("Crop zoom").props.value, ui.range("Horizontal focus").props.value, ui.range("Vertical focus").props.value], [1, 50, 50]);
  ui.click("Pen"); draw(3); ui.change("Crop zoom", 3);
  call(ui.all().find((node) => node.props["aria-label"] === "Use color #2563eb")!, "onClick"); ui.render();
  (ui.intake().onFiles as (files: File[], refused: File[]) => void)([new File(["new"], "new.png", { type: "image/png" })], []); ui.render(); ui.load();
  assert.equal(ui.button("Pan").props["aria-pressed"], true);
  assert.equal(ui.range("Crop zoom").props.value, 1);
  assert.equal(ui.button("Undo last stroke").props.disabled, true);
  ui.click("Pen"); assert.equal(ui.all().find((node) => node.props["aria-label"] === "Use color #dc2626")!.props["aria-pressed"], true);
  assert.equal(ui.revoked.length, 1);
});

it("a second pointer removes only the unfinished stroke and no pinch tail draws after either finger lifts", async (t) => {
  const ui = workspace(t); ui.load(); ui.click("Pen");
  ui.pointer("onPointerDown", 1, 100, 100); ui.pointer("onPointerMove", 1, 150, 150); ui.pointer("onPointerUp", 1, 150, 150);
  ui.pointer("onPointerDown", 2, 150, 150); ui.pointer("onPointerMove", 2, 160, 150);
  ui.pointer("onPointerDown", 3, 250, 150); ui.pointer("onPointerMove", 3, 300, 150);
  assert.ok(Number(ui.range("Crop zoom").props.value) > 1);
  ui.pointer("onPointerUp", 3, 300, 150); ui.pointer("onPointerMove", 2, 170, 170); ui.pointer("onLostPointerCapture", 2, 170, 170);
  assert.equal(ui.captures.size, 0);
  assert.equal((await ui.commands()).filter((command) => command[0] === "stroke").length, 1);
  ui.pointer("onPointerDown", 4, 20, 20); ui.pointer("onPointerMove", 4, 40, 40); ui.pointer("onPointerCancel", 4, 40, 40);
  assert.equal(ui.captures.size, 0);
  const zoom = ui.range("Crop zoom").props.value;
  ui.pointer("onPointerMove", 4, 400, 400); assert.equal(ui.range("Crop zoom").props.value, zoom);
});

it("wheel uses the cursor, omitted aspect uses the source, and disabled/pending blocks gestures, intake and duplicate prepare", async (t) => {
  let finish: () => void = () => {};
  const ui = workspace(t, { aspect: undefined, onPrepared: () => new Promise<void>((resolve) => { finish = resolve; }) }); ui.load();
  const frame = ui.all().find((node) => (node.props.style as Props | undefined)?.aspectRatio)!;
  assert.equal((frame.props.style as Props).aspectRatio, String(1600 / 900));
  let prevented = 0;
  const wheel = () => ui.listeners.get("wheel")!({ clientX: 110, clientY: 95, deltaY: -250, preventDefault: () => prevented++ });
  wheel(); ui.render(); assert.equal(ui.range("Crop zoom").props.value, 1.5);
  ui.setDisabled(true); wheel(); ui.render(); assert.equal(prevented, 1);
  ui.pointer("onPointerDown", 1, 100, 100); ui.pointer("onPointerMove", 1, 300, 300); assert.equal(ui.captures.size, 0);
  ui.setDisabled(false);
  const stalePrepare = ui.button("Use prepared image");
  const preparing = call(stalePrepare, "onClick") as Promise<void>;
  await Promise.resolve(); ui.render();
  await call(stalePrepare, "onClick"); assert.equal(ui.files.length, 1);
  assert.equal(ui.intake().disabled, true);
  (ui.intake().onFiles as (files: File[], refused: File[]) => void)([new File(["replace"], "replace.png", { type: "image/png" })], []); ui.render();
  assert.equal(ui.range("Crop zoom").props.value, 1.5);
  ui.pointer("onPointerDown", 2, 100, 100); assert.equal(ui.captures.size, 0);
  finish(); await preparing; ui.render();
});

it("keeps export raster/encoder inputs byte-identical to the previous formula in a deterministic canvas fixture", async (t) => {
  const previous: typeof geometry.cropRect = ({ naturalWidth, naturalHeight, aspect, zoom, panX, panY }) => {
    let width = naturalWidth, height = naturalHeight;
    if (aspect && aspect > 0) { if (width / height > aspect) width = height * aspect; else height = width / aspect; }
    width /= zoom; height /= zoom;
    return { x: (naturalWidth - width) * (panX / 100), y: (naturalHeight - height) * (panY / 100), width, height };
  };
  const prepareFixture = async (cropRect: typeof geometry.cropRect) => {
    const ui = workspace(t, { outputType: "image/jpeg" }, cropRect); ui.load();
    ui.change("Crop zoom", 2); ui.change("Horizontal focus", 0); ui.change("Vertical focus", 100);
    ui.click("Pen"); ui.pointer("onPointerDown", 1, 40, 60); ui.pointer("onPointerMove", 1, 200, 120); ui.pointer("onPointerUp", 1, 200, 120);
    return new Uint8Array(await (await ui.save()).arrayBuffer());
  };
  assert.deepEqual(await prepareFixture(geometry.cropRect), await prepareFixture(previous));
});

it("keeps the four consumer configurations, dimension/format policy and bounded compression with safe retry", async (t) => {
  for (const options of [
    { aspect: 4 / 5, maxDimension: 1600, outputType: "image/jpeg", openOnMount: true, pasteFromPage: true },
    { aspect: 4 / 5, maxDimension: 1600, outputType: "image/jpeg" },
    { aspect: 4 / 5, maxDimension: 1600, outputType: "image/jpeg", pasteFromPage: true },
    { aspect: 4 / 3, maxDimension: 1600, outputType: "image/jpeg" },
  ]) {
    const ui = workspace(t, options); ui.image.naturalWidth = 4000; ui.image.naturalHeight = 3000; ui.load();
    const file = await ui.save();
    assert.equal(file.type, "image/jpeg"); assert.equal(file.name, "source.jpg");
    assert.equal(ui.encodes.length, 1);
    assert.equal(Math.max(ui.encodes[0].width, ui.encodes[0].height), 1600);
    assert.equal(ui.intake().pasteFromPage, options.pasteFromPage ?? false);
  }
  const compressed = workspace(t, { outputType: "image/jpeg", outputQuality: 0.8, targetBytes: 1 }); compressed.load();
  await compressed.save();
  assert.deepEqual(compressed.encodes.map(({ width, quality }) => ({ scale: width / 1200, quality })), adjustments.compressionSteps("image/jpeg", 0.8));
  const refused = workspace(t, { maxBytes: 10 }); refused.load(); await refused.save();
  assert.equal(refused.files.length, 0);
  assert.ok(refused.all().some((node) => node.props.role === "alert" && text(node).includes("could not be prepared")));
  assert.equal(refused.button("Use prepared image").props.pending, false);
});

it("keeps picker/initial-file intake guards and unsupported-file errors", (t) => {
  const picker = workspace(t, { initialFile: null, openOnMount: true });
  assert.equal(picker.pickerClicks(), 1); picker.render(); assert.equal(picker.pickerClicks(), 1);
  (picker.intake().onFiles as (files: File[], refused: File[]) => void)([], [new File(["bad"], "bad.txt", { type: "text/plain" })]); picker.render();
  assert.ok(picker.all().some((node) => node.props.role === "alert" && text(node).includes("supported image")));
  const off = workspace(t, { initialFile: null, openOnMount: true, disabled: true }); assert.equal(off.pickerClicks(), 0);
  assert.equal(off.intake().disabled, true);
});
