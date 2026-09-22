// The preview frame: one demo, in one appearance, in its own realm. The
// parent names the component, the variant and the mode in the query; this
// mounts it, reports its height, and in canvas mode re-renders on the values
// the parent posts.
import { mount } from "publr/dom";
import { mountIconSprite } from "../../src/icons";
import { startEngine } from "./runtime/engine";
import { loadComponents, renderNode } from "./runtime/render-node";
import { loaders } from "./generated/loaders";
import { formatRenderedHtml } from "./runtime/html";
import { HOVER_PREVIEW_SURFACE_CLASSES, PREVIEW_SURFACE_CLASSES, PREVIEW_SURFACE_WIDTHS } from "./frames/surfaces";
import type { ComponentCanvasControl, ComponentCanvasValue, ComponentDemoModule, DemoNode } from "../gallery-types";

const params = new URLSearchParams(location.search);
const name = params.get("component") ?? "";
const variantIndex = Number(params.get("variant") ?? "-1");
const appearance = params.get("appearance") === "dark" ? "dark" : "light";
const mode = params.get("mode") ?? "preview";
const frameId = params.get("frame") ?? "";
const loaderByName = loaders as Record<string, () => Promise<ComponentDemoModule>>;

const post = (message: Record<string, unknown>) => parent.postMessage({ ...message, frame: frameId }, location.origin);

mountIconSprite(document);
const stem = params.get("stem") ?? "";
const [module] = await Promise.all([
  stem in loaderByName ? loaderByName[stem]().then((loaded) => loaded as ComponentDemoModule) : Promise.resolve(undefined),
  startEngine("./runtime/jit_engine.wasm"),
]);

const root = document.getElementById("preview")!;
if (appearance === "dark") document.documentElement.classList.add("dark");
document.body.className = "bg-background text-foreground";

if (!module) {
  root.innerHTML = `<p class="p-4 text-sm text-destructive">Unknown component preview.</p>`;
} else {
  const surface = module.meta.preview;
  root.dataset.mode = mode;
  if (mode === "canvas") {
    root.className = "relative grid place-items-center overflow-hidden bg-background p-10 text-foreground";
    root.innerHTML = `<div class="gallery-canvas-dots absolute inset-0" aria-hidden="true"></div>
      <div class="${PREVIEW_SURFACE_WIDTHS[surface]} relative z-10 grid w-full place-items-center">
        <div data-host class="grid min-w-60 flex-1 place-items-center"></div>
      </div>`;
    document.addEventListener("pointerdown", () => post({ type: "gallery-canvas-pointerdown" }));
  } else {
    const surfaceClass = mode === "hover" ? HOVER_PREVIEW_SURFACE_CLASSES[surface] : PREVIEW_SURFACE_CLASSES[surface];
    root.className = "grid min-w-0 place-items-center";
    root.innerHTML = `<div class="${surfaceClass} bg-background text-foreground"><div data-host class="min-w-0 flex-1"></div></div>`;
  }
}

const host = document.querySelector<HTMLElement>("[data-host]");
let dispose: (() => void) | null = null;

/** The demo to mount: a Demo closure, or a node tree once its components are loaded. */
async function demoMaker(values?: Record<string, ComponentCanvasValue>): Promise<(() => Node) | undefined> {
  if (!module) return undefined;
  const fromNode = async (node: DemoNode) => {
    await loadComponents(node);
    return () => renderNode(node);
  };
  if (mode === "canvas" && module.canvas && values) {
    const canvas = module.canvas;
    const node = canvas.node ? canvas.node(values) : undefined;
    if (node) return fromNode(node);
    if (canvas.Demo) return () => canvas.Demo!(values);
    return fromNode({ component: module.meta.portableName ?? module.meta.source.split("/").at(-1)!.replace(/\.ptsx$/, ""), props: values as Record<string, unknown> });
  }
  const variant = variantIndex >= 0 ? module.variants?.[variantIndex] : undefined;
  if (variant) return variant.Demo;
  if (module.Demo) return module.Demo;
  const node = module.node;
  return node ? fromNode(node) : undefined;
}

let renderSequence = 0;

async function render(values?: Record<string, ComponentCanvasValue>): Promise<void> {
  if (!host) return;
  const sequence = ++renderSequence;
  const make = await demoMaker(values);
  if (sequence !== renderSequence) return;
  dispose?.();
  dispose = null;
  host.replaceChildren();
  if (!make) return;
  try {
    dispose = mount(host, make, {});
  } catch (error) {
    host.innerHTML = `<p class="text-[11px] text-destructive"></p>`;
    host.firstElementChild!.textContent = String(error);
  }
  if (mode === "source") post({ type: "gallery-api-html", html: formatRenderedHtml(host.innerHTML) });
}

/** The canvas seeds its values from the recipe until the parent sends some. */
function defaults(controls: readonly ComponentCanvasControl[], values: Record<string, ComponentCanvasValue>, scope = ""): void {
  for (const control of controls) {
    if (control.type === "group") defaults(control.controls, values, scope);
    else if (control.type === "children") values[scope ? `${scope}::${control.name}` : control.name] = [];
    else values[scope ? `${scope}::${control.name}` : control.name] = control.default;
  }
}

if (mode === "canvas") {
  const seeded: Record<string, ComponentCanvasValue> = {};
  defaults(module?.canvas?.controls ?? [], seeded);
  await render(seeded);
  addEventListener("message", (event: MessageEvent<{ type?: string; values?: Record<string, ComponentCanvasValue> }>) => {
    if (event.origin !== location.origin || event.data?.type !== "gallery-canvas-render" || !event.data.values) return;
    render({ ...event.data.values });
  });
} else {
  await render();
  const report = () => post({ type: "gallery-preview-resize", height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
  new ResizeObserver(report).observe(document.documentElement);
  report();
}
post({ type: "gallery-preview-mounted" });
