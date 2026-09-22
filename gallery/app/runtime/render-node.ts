// A recipe's declarative demo tree, rendered through the component registry.
// A node names a component and its props; children are nodes, and a prop
// value may itself hold nodes (a `children` prop mixing text and a node).
import { component } from "publr-jsx";
import type { DemoNode } from "../../gallery-types";

type Make = (props: Record<string, unknown>) => Node;

const registry: Record<string, Make> = {};

/** The component names a tree uses, including those inside prop values. */
function names(tree: DemoNode, into: Set<string>): Set<string> {
  if ("component" in tree && tree.component) into.add(tree.component);
  for (const child of tree.children ?? []) names(child as DemoNode, into);
  const props = (tree as { props?: Record<string, unknown> }).props ?? {};
  for (const key of Object.keys(props)) {
    const value = props[key];
    for (const item of Array.isArray(value) ? value : [value]) if (isNode(item)) names(item, into);
  }
  return into;
}

/** Loads the modules a tree names; a component's module is the file of its name. */
export async function loadComponents(tree: DemoNode): Promise<void> {
  const loaded = await import("../generated/components");
  const loaders = loaded.loaders as Record<string, () => Promise<Record<string, unknown>>>;
  const wanted = [...names(tree, new Set())].filter((name) => !registry[name]);
  await Promise.all(
    wanted.map(async (name) => {
      const load = loaders[name];
      if (!load) throw new Error(`gallery: no module for component ${name}`);
      const module = await load();
      const fn = module[name];
      if (typeof fn !== "function") throw new Error(`gallery: ${name} is not exported by its module`);
      registry[name] = fn as Make;
    }),
  );
}

const isNode = (value: unknown): value is DemoNode =>
  Boolean(value) && typeof value === "object" && ("component" in (value as object) || "fragment" in (value as object));

export function renderNode(node: DemoNode): Node {
  const root = make(node);
  if (!node.wrapper) return root;
  const wrapper = document.createElement("div");
  wrapper.className = node.wrapper;
  wrapper.append(root);
  return wrapper;
}

/** A prop value with nodes inside becomes real nodes; anything else passes through. */
function value(input: unknown): unknown {
  if (isNode(input)) return make(input);
  if (Array.isArray(input) && input.some(isNode)) return input.map((item) => (isNode(item) ? make(item) : item));
  return input;
}

function make(tree: DemoNode): Node {
  const kids = (tree.children ?? []).map(make);
  if ("fragment" in tree && tree.fragment) return fragmentOf(kids);
  const name = (tree as { component: string }).component;
  const fn = registry[name];
  if (!fn) throw new Error(`gallery: unknown component ${name}` + (Object.keys(registry).length ? "" : " (components not loaded)"));
  const authored = (tree as { props?: Record<string, unknown> }).props ?? {};
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(authored)) props[key] = value(authored[key]);
  // The compiler passes one child as the node and several as an array.
  if (kids.length === 1) props.children = kids[0];
  else if (kids.length > 1) props.children = kids;
  return component(fn, props);
}

function fragmentOf(nodes: Node[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) fragment.append(node);
  return fragment;
}
