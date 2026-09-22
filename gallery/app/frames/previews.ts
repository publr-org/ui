// The parent side of the preview frames. Every demo runs in its own iframe,
// its own realm: the family components keep their store at module level, so
// two Selects in one document would share one value. The frame reports its
// height and, for the API page, the markup it rendered; the canvas frame
// takes its prop values by message.
import { entries, type Appearance, type DemoEntry } from "../state/gallery";
import { currentValues } from "../state/canvas";
import { HOVER_PREVIEW_SURFACE_INITIAL_HEIGHTS, PREVIEW_SURFACE_INITIAL_HEIGHTS } from "./surfaces";

export type FrameMode = "preview" | "hover" | "canvas" | "source";

export type FrameMessage =
  | { type: "gallery-preview-mounted"; frame: string }
  | { type: "gallery-preview-resize"; frame: string; height: number }
  | { type: "gallery-api-html"; frame: string; html: string }
  | { type: "gallery-canvas-pointerdown"; frame: string };

let nextFrameId = 0;

/** The URL of a preview frame for one demo in one appearance. */
export function frameSource(entry: DemoEntry, variant: number, appearance: Appearance, mode: FrameMode): { id: string; src: string } {
  const id = `preview-${++nextFrameId}`;
  const query = new URLSearchParams({ component: entry.name, stem: entry.stem, variant: String(variant), appearance, mode, frame: id });
  return { id, src: `./preview.html?${query.toString()}` };
}

export function initialHeight(entry: DemoEntry, mode: FrameMode): number | undefined {
  if (mode === "canvas") return undefined;
  return mode === "hover" ? HOVER_PREVIEW_SURFACE_INITIAL_HEIGHTS[entry.preview] : PREVIEW_SURFACE_INITIAL_HEIGHTS[entry.preview];
}

export function defaultVariantIndex(entry: DemoEntry): number {
  return entry.variants?.length ? 0 : -1;
}

// ── Staged loading ─────────────────────────────────────────────────────────

const CONCURRENT = 4;
const waiting: HTMLIFrameElement[] = [];
let inFlight = 0;
let observer: IntersectionObserver | null = null;

function startNext(): void {
  while (inFlight < CONCURRENT && waiting.length) {
    const frame = waiting.shift()!;
    if (!frame.isConnected || !frame.dataset.src) continue;
    inFlight++;
    frame.src = frame.dataset.src;
    delete frame.dataset.src;
    // A frame that never reports (removed mid-load) must not hold a slot.
    const release = () => {
      inFlight = Math.max(0, inFlight - 1);
      startNext();
    };
    frame.addEventListener("load", release, { once: true });
    setTimeout(release, 4000);
  }
}

/** A ref for preview frames: the frame starts loading once near the viewport. */
export function observeFrame(element: Element | null): void {
  if (!element) return;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer!.unobserve(entry.target);
        waiting.push(entry.target as HTMLIFrameElement);
      }
      startNext();
    },
    { rootMargin: "400px 0px" },
  );
  observer.observe(element);
}

const frameOf = (id: string) => document.querySelector<HTMLIFrameElement>(`iframe[data-frame-id="${CSS.escape(id)}"]`);

/** Posts the current values to the canvas frame; it re-renders in place. */
export function renderCanvas(entry: DemoEntry): void {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-frame-mode="canvas"]');
  frame?.contentWindow?.postMessage({ type: "gallery-canvas-render", values: currentValues(entry) }, location.origin);
}

let onCanvasPointerDown: (() => void) | null = null;
let onApiHtml: ((entry: string, html: string) => void) | null = null;

/** Listens for every frame's messages, once. */
export function installFrameListener(handlers: { canvasPointerDown: () => void; apiHtml: (entry: string, html: string) => void }): void {
  onCanvasPointerDown = handlers.canvasPointerDown;
  onApiHtml = handlers.apiHtml;
  addEventListener("message", (event: MessageEvent<FrameMessage>) => {
    if (event.origin !== location.origin || !event.data || typeof event.data !== "object" || !("frame" in event.data)) return;
    const message = event.data;
    const frame = frameOf(message.frame);
    if (!frame || event.source !== frame.contentWindow) return;
    if (message.type === "gallery-preview-mounted") {
      if (frame.dataset.frameMode === "canvas") {
        const entry = entries.find((candidate) => candidate.name === frame.dataset.frameEntry);
        if (entry) frame.contentWindow?.postMessage({ type: "gallery-canvas-render", values: currentValues(entry) }, location.origin);
      }
    } else if (message.type === "gallery-preview-resize") {
      if (frame.dataset.frameMode === "canvas" || !Number.isFinite(message.height)) return;
      const minimum = Number(frame.dataset.frameMinHeight ?? "0");
      frame.style.height = `${Math.max(minimum, message.height)}px`;
    } else if (message.type === "gallery-api-html") {
      onApiHtml?.(frame.dataset.frameEntry ?? "", message.html);
    } else if (message.type === "gallery-canvas-pointerdown") {
      onCanvasPointerDown?.();
    }
  });
}
