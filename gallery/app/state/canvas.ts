// The canvas values: one prop bag per component, seeded from the recipe's
// controls, edited by the property panel, and posted to the canvas frame.
import { state, type DemoEntry } from "./gallery";
import type {
  ComponentCanvasChildDefault,
  ComponentCanvasChildInstance,
  ComponentCanvasChildrenControl,
  ComponentCanvasControl,
  ComponentCanvasFieldControl,
  ComponentCanvasValue,
} from "../../gallery-types";

// ── Canvas values ──────────────────────────────────────────────────────────

export type ValueControl = ComponentCanvasFieldControl | ComponentCanvasChildrenControl;

const canvasValues = new Map<string, Record<string, ComponentCanvasValue>>();
let nextChildId = 0;

export const valueName = (scope: string, name: string) => (scope ? `${scope}::${name}` : name);

export const childInstances = (value: ComponentCanvasValue | undefined): ComponentCanvasChildInstance[] =>
  Array.isArray(value)
    ? (value as unknown[]).filter(
        (item): item is ComponentCanvasChildInstance =>
          Boolean(item) && typeof item === "object" && "id" in (item as object) && "type" in (item as object),
      )
    : [];

const newChild = (type: string): ComponentCanvasChildInstance => ({ id: `canvas-child-${++nextChildId}`, type });

export function valueControls(controls: readonly ComponentCanvasControl[]): ValueControl[] {
  return controls.flatMap((control): ValueControl[] => {
    if (control.type === "group") return valueControls(control.controls);
    if (control.type === "children") return [control, ...control.options.flatMap((option) => valueControls(option.controls))];
    return [control];
  });
}

export function fieldDefinition(entry: DemoEntry, name: string | undefined): ComponentCanvasFieldControl | undefined {
  const definitionName = name?.split("::").at(-1);
  return valueControls(entry.canvas?.controls ?? []).find(
    (control): control is ComponentCanvasFieldControl => control.type !== "children" && control.name === definitionName,
  );
}

export function childrenDefinition(entry: DemoEntry, name: string | undefined): ComponentCanvasChildrenControl | undefined {
  const definitionName = name?.split("::").at(-1);
  return valueControls(entry.canvas?.controls ?? []).find(
    (control): control is ComponentCanvasChildrenControl => control.type === "children" && control.name === definitionName,
  );
}

export function canvasValue(entry: DemoEntry, control: ValueControl, scope = ""): ComponentCanvasValue {
  const values = canvasValues.get(entry.name);
  const key = valueName(scope, control.name);
  if (values && Object.hasOwn(values, key)) return values[key]!;
  return control.type === "children" ? [] : control.default;
}

function initialize(
  values: Record<string, ComponentCanvasValue>,
  controls: readonly ComponentCanvasControl[],
  scope = "",
  overrides: Readonly<Record<string, ComponentCanvasValue | readonly ComponentCanvasChildDefault[]>> = {},
): void {
  for (const control of controls) {
    if (control.type === "group") {
      initialize(values, control.controls, scope, overrides);
      continue;
    }
    const key = valueName(scope, control.name);
    if (control.type !== "children") {
      values[key] = (overrides[control.name] as ComponentCanvasValue | undefined) ?? control.default;
      continue;
    }
    const defaults = Array.isArray(overrides[control.name])
      ? (overrides[control.name] as readonly ComponentCanvasChildDefault[])
      : control.default;
    values[key] = defaults.map((item) => {
      const definition = typeof item === "string" ? { type: item, values: undefined } : item;
      const instance = newChild(definition.type);
      const option = control.options.find((candidate) => candidate.name === definition.type);
      if (option) initialize(values, option.controls, instance.id, definition.values);
      return instance;
    });
  }
}

export function currentValues(entry: DemoEntry): Record<string, ComponentCanvasValue> {
  const current = canvasValues.get(entry.name);
  if (current) return current;
  const initial: Record<string, ComponentCanvasValue> = {};
  initialize(initial, entry.canvas?.controls ?? []);
  canvasValues.set(entry.name, initial);
  return initial;
}

export function resetValues(entry: DemoEntry): void {
  canvasValues.delete(entry.name);
}

export function addChild(entry: DemoEntry, name: string, type: string): void {
  const definition = childrenDefinition(entry, name);
  if (!definition) return;
  const values = currentValues(entry);
  const selected = childInstances(values[name]);
  if (!definition.allowMultiple && selected.some((item) => item.type === type)) return;
  const instance = newChild(type);
  const option = definition.options.find((candidate) => candidate.name === type);
  if (option) initialize(values, option.controls, instance.id);
  values[name] = [...selected, instance];
}

export function removeChild(entry: DemoEntry, name: string, instanceId: string): void {
  const values = currentValues(entry);
  values[name] = childInstances(values[name]).filter((item) => item.id !== instanceId);
  const prefix = `${instanceId}::`;
  const descendants = Object.entries(values)
    .filter((pair) => pair[0].startsWith(prefix))
    .flatMap((pair) => childInstances(pair[1]).map((child) => child.id));
  for (const child of descendants) removeChild(entry, name, child);
  for (const key of Object.keys(values)) if (key.startsWith(prefix)) delete values[key];
  const index = state.canvasPanels.indexOf(instanceId);
  if (index >= 0) state.canvasPanels = state.canvasPanels.slice(0, index);
}

/** Whether a change to `name` reshapes the control tree, so the whole shell re-renders. */
export function reshapesControls(controls: readonly ComponentCanvasControl[], name: string): boolean {
  return controls.some(
    (control) =>
      control.visibleWhen?.control === name ||
      (control.type === "group" && (control.labelControl === name || reshapesControls(control.controls, name))),
  );
}

