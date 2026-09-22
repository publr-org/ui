// Classes to CSS in the browser: the jit engine as wasm, fed every class the
// page uses. The design system has no stylesheet of its own; every utility a
// component names is compiled here, on demand, against the gallery theme.
import { setClassResolver } from "publr/class-merge";
import { THEME_TOKENS } from "./theme";

interface Exports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  free(ptr: number, len: number): void;
  compileWithTheme(classes: number, classesLen: number, theme: number, themeLen: number): number;
  resolveClassesWithTheme(classes: number, classesLen: number, theme: number, themeLen: number): number;
  outLen(): number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const theme = encoder.encode(JSON.stringify({ tokens: THEME_TOKENS }));

let exports: Exports | null = null;
const seen = new Set<string>();
let sheet: HTMLStyleElement | null = null;
let scheduled = false;
let dirty = false;

function call(fn: "compileWithTheme" | "resolveClassesWithTheme", classes: string): string {
  return callEngine(fn, classes);
}

let shared: SharedWindow["__publrJitCall"] | null = null;

function callEngine(fn: "compileWithTheme" | "resolveClassesWithTheme", classes: string): string {
  // A frame calls the parent's engine: same origin, same thread, no second instance.
  if (shared) return shared(fn, classes);
  const ex = exports!;
  const input = encoder.encode(classes);
  const inPtr = ex.alloc(input.length);
  const themePtr = ex.alloc(theme.length);
  if (!inPtr || !themePtr) throw new Error("jit: allocation failed");
  try {
    new Uint8Array(ex.memory.buffer, inPtr, input.length).set(input);
    new Uint8Array(ex.memory.buffer, themePtr, theme.length).set(theme);
    const out = ex[fn](inPtr, input.length, themePtr, theme.length);
    const len = ex.outLen();
    if (!out) throw new Error(`jit: ${fn} failed`);
    try {
      return decoder.decode(new Uint8Array(ex.memory.buffer, out, len));
    } finally {
      ex.free(out, len);
    }
  } finally {
    ex.free(themePtr, theme.length);
    ex.free(inPtr, input.length);
  }
}

function collect(root: ParentNode): void {
  const walk = (element: Element) => {
    for (const name of element.classList) if (!seen.has(name)) { seen.add(name); dirty = true; }
  };
  if (root instanceof Element) walk(root);
  for (const element of root.querySelectorAll("[class]")) walk(element);
}

function recompile(): void {
  scheduled = false;
  if (!dirty || !(exports || shared)) return;
  dirty = false;
  const css = call("compileWithTheme", [...seen].join(" "));
  sheet ??= document.head.appendChild(document.createElement("style"));
  sheet.textContent = css;
  document.documentElement.setAttribute("data-jit-ready", "");
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(recompile);
}

type SharedWindow = Window & {
  __publrJitModule?: Promise<WebAssembly.Module>;
  __publrJitCall?: (fn: "compileWithTheme" | "resolveClassesWithTheme", classes: string) => string;
};

/**
 * The compiled engine, once per document tree: a preview frame takes the
 * parent's module instead of fetching and compiling its own.
 */
function ownerWindow(): SharedWindow {
  try {
    return parent !== window && parent.location.origin === location.origin ? (parent as SharedWindow) : (window as SharedWindow);
  } catch {
    return window as SharedWindow;
  }
}

function engineModule(url: string): Promise<WebAssembly.Module> {
  const owner = ownerWindow();
  owner.__publrJitModule ??= fetch(new URL(url, owner.location.href)).then((response) => response.arrayBuffer()).then((bytes) => WebAssembly.compile(bytes));
  return owner.__publrJitModule;
}

/** Loads the engine, compiles what the page has, and keeps compiling as it changes. */
export async function startEngine(url: string): Promise<void> {
  const owner = ownerWindow();
  if (owner !== window && owner.__publrJitCall) {
    shared = owner.__publrJitCall;
  } else {
    const module = await engineModule(url);
    const instance = await WebAssembly.instantiate(module, {});
    exports = instance.exports as unknown as Exports;
    (window as SharedWindow).__publrJitCall = (fn, classes) => callEngine(fn, classes);
  }
  setClassResolver((classes) => JSON.parse(call("resolveClassesWithTheme", classes.join(" "))));
  collect(document);
  recompile();
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") collect(record.target as Element);
      for (const node of record.addedNodes) if (node instanceof Element) collect(node);
    }
    if (dirty) schedule();
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
}
