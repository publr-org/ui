// The gallery's state and pure logic: the entries, the route, the search
// query, the open flyouts. The PTSX views read it and call `update`, which
// re-renders the shell; nothing here touches the DOM.
import { recipes } from "../generated/recipes";
export { formatRenderedHtml } from "../runtime/html";
import type {
  ComponentCanvas,
  ComponentDemoMeta,
  ComponentDemoModule,
  ComponentDemoVariant,
  ComponentGroup,
  ComponentKind,
  DemoNode,
} from "../../gallery-types";

export type DemoEntry = ComponentDemoMeta & {
  /** The recipe's file stem, which the frames load it by. */
  stem: string;
  Demo?: () => Node;
  variants?: ComponentDemoVariant[];
  canvas?: ComponentCanvas;
  node?: DemoNode;
};

export type ComponentPage = "overview" | "guidelines" | "api" | "preview" | "canvas";
export type GalleryRoute =
  | { kind: "introduction" }
  | { kind: "components" }
  | { kind: "component"; name: string; page: ComponentPage };
export type Appearance = "light" | "dark";
export type SourceMode = "ptsx" | "html";

export const KIND_LABELS: Record<ComponentKind, string> = {
  primitive: "Primitives",
  composite: "Composites",
};
export const KIND_HELP: Record<ComponentKind, string> = {
  primitive: "Generic building blocks, usable in any context",
  composite: "Concrete patterns built for a specific placement",
};
const GROUP_ORDER: ComponentGroup[] = ["Essentials", "Navigation", "Forms", "Editor", "Other"];
// Foundations are ordered by dependency rather than alphabet: Field leads
// Forms because every other form control composes inside it.
const COMPONENT_ORDER = ["text", "heading", "icon", "separator", "button", "field"];

const rank = (list: readonly string[], value: string) => {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
};

export const entries: DemoEntry[] = (recipes as unknown as { stem: string; module: ComponentDemoModule }[])
  .map((recipe) => ({
    ...recipe.module.meta,
    stem: recipe.stem,
    Demo: recipe.module.Demo,
    variants: recipe.module.variants,
    canvas: recipe.module.canvas,
    node: recipe.module.node,
  }))
  .sort((a, b) => {
    const kind = rank(["primitive", "composite"], a.kind) - rank(["primitive", "composite"], b.kind);
    if (kind) return kind;
    const group = rank(GROUP_ORDER, a.group) - rank(GROUP_ORDER, b.group);
    if (group) return group;
    return rank(COMPONENT_ORDER, a.name) - rank(COMPONENT_ORDER, b.name) || a.label.localeCompare(b.label);
  });

export const groupCount = new Set(entries.map((entry) => entry.group)).size;

// ── Route ──────────────────────────────────────────────────────────────────

export function parseRoute(hash: string): GalleryRoute {
  const value = decodeURIComponent(hash.replace(/^#/, ""));
  if (!value || value === "introduction") return { kind: "introduction" };
  if (value === "components") return { kind: "components" };
  const parts = value.split("/");
  const name = parts[0];
  const rawPage = parts[1] ?? "overview";
  if (!entries.some((entry) => entry.name === name)) return { kind: "introduction" };
  const page: ComponentPage =
    rawPage === "guidelines" || rawPage === "api" || rawPage === "preview" || rawPage === "canvas"
      ? rawPage
      : "overview";
  return { kind: "component", name, page };
}

export function routeHash(route: GalleryRoute): string {
  if (route.kind === "introduction") return "#introduction";
  if (route.kind === "components") return "#components";
  return `#${encodeURIComponent(route.name)}/${route.page}`;
}

// ── State ──────────────────────────────────────────────────────────────────

export const state = {
  route: parseRoute(location.hash),
  query: "",
  expandedKinds: new Set<ComponentKind>(["primitive"]),
  expandedComponents: new Set<string>(),
  canvasAppearance: "light" as Appearance,
  apiSourceMode: "ptsx" as SourceMode,
  /** The open canvas flyouts, outermost first. */
  canvasPanels: [] as string[],
  canvasPanelsEntry: "",
  renderedHtml: new Map<string, string>(),
};

let listeners: (() => void)[] = [];
/** The shell re-renders on every update; cheap, and exactly what the old gallery did. */
export function onUpdate(listener: () => void): void {
  listeners.push(listener);
}
export function update(): void {
  for (const listener of listeners) listener();
}

export function currentEntry(): DemoEntry | undefined {
  if (state.route.kind !== "component") return undefined;
  const name = state.route.name;
  return entries.find((entry) => entry.name === name);
}

export function revealComponent(name: string): void {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) return;
  state.expandedKinds.add(entry.kind);
  state.expandedComponents.add(entry.name);
}

export function selectRoute(next: GalleryRoute): void {
  if (next.kind === "component") revealComponent(next.name);
  const current = state.route;
  if (
    next.kind === "component" &&
    next.page === "api" &&
    (current.kind !== "component" || current.name !== next.name || current.page !== "api")
  ) {
    state.apiSourceMode = "ptsx";
  }
  state.canvasPanels = [];
  state.route = next;
  history.replaceState(null, "", routeHash(next));
  update();
}

export function filteredEntries(): DemoEntry[] {
  const needle = state.query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.label, entry.name, entry.kind, entry.group, entry.description, ...entry.tags, JSON.stringify(entry.docs)]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

// ── Helpers the views share ────────────────────────────────────────────────

export const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const groupLabel = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("-", " ");

export function agentReference(entry: DemoEntry): string {
  return JSON.stringify(
    {
      component: entry.label,
      name: entry.name,
      kind: entry.kind,
      group: entry.group,
      source: entry.source,
      description: entry.description,
      usage: entry.usage,
      tags: entry.tags,
      documentation: entry.docs,
      examples: entry.variants?.map((variant) => ({
        label: variant.label,
        description: variant.description,
        usage: variant.usage,
        notes: variant.notes,
      })) ?? [{ label: "Default", description: entry.previewLabel }],
    },
    null,
    2,
  );
}

export async function copyText(value: string, button: HTMLButtonElement): Promise<void> {
  const previous = button.textContent;
  try {
    await navigator.clipboard?.writeText(value);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

const TOKEN =
  /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[A-Za-z][\w.-]*|\/?>|\b[A-Za-z_:][\w:.-]*(?=\s*=)|\b(?:const|let|var|function|return|if|else|true|false|null|undefined)\b|[{}()[\]])/g;

/** Syntax colouring for a code block, as `[text, colourClass]` runs. */
export function highlight(code: string): [string, string][] {
  const runs: [string, string][] = [];
  let cursor = 0;
  for (const match of code.matchAll(TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) runs.push([code.slice(cursor, index), ""]);
    const cls =
      token.startsWith("//") || token.startsWith("/*")
        ? "text-[#8b949e]"
        : /^["'`]/.test(token)
          ? "text-[#a5d6ff]"
          : token.startsWith("<") || token === ">" || token === "/>"
            ? "text-[#7ee787]"
            : /^(const|let|var|function|return|if|else|true|false|null|undefined)$/.test(token)
              ? "text-[#ff7b72]"
              : /^[A-Za-z_:]/.test(token)
                ? "text-[#d2a8ff]"
                : "text-[#f2cc60]";
    runs.push([token, cls]);
    cursor = index + token.length;
  }
  if (cursor < code.length) runs.push([code.slice(cursor), ""]);
  return runs;
}
