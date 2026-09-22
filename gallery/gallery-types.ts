export type ComponentKind = "primitive" | "composite";

export type ComponentGroup = "Essentials" | "Navigation" | "Forms" | "Editor" | "Other";

export type PreviewSurface = "toolbar" | "inspector" | "canvas" | "overlay" | "demo";

export type ComponentRule = {
  title: string;
  description: string;
};

export type ComponentPropDoc = {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  default?: string;
};

export type ComponentDocumentation = {
  purpose: string[];
  useWhen: string[];
  avoidWhen: string[];
  rules: ComponentRule[];
  accessibility: string[];
  composition: string[];
  agentNotes: string[];
  props: ComponentPropDoc[];
};

export type ComponentDemoMeta = {
  /** Stable deep-link key. */
  name: string;
  /** Human-readable component name. */
  label: string;
  source: string;
  /** Exported component name when it intentionally differs from the source filename. */
  portableName?: string;
  kind: ComponentKind;
  /** Closed navigation family within the primitive/composite hierarchy. */
  group: ComponentGroup;
  description: string;
  tags: string[];
  usage: string;
  /** Representative product surface where the component is normally encountered. */
  preview: PreviewSurface;
  previewLabel: string;
  /** Colocated structured prose is both the human guide and coding-agent contract. */
  docs: ComponentDocumentation;
};

export type ComponentDemoVariant = {
  /** The first variant is the canonical default used by Overview and sidebar previews. */
  label: string;
  /** Declarative demo. Required for this variant to render in the ZSX target. */
  node?: DemoNode;
  description?: string;
  usage?: string;
  notes?: string[];
  Demo: () => JSX.Element;
};

export type ComponentCanvasOption = {
  label: string;
  value: string;
};

export type ComponentCanvasValue =
  | string
  | number
  | boolean
  | null
  | readonly ComponentCanvasOption[]
  | readonly ComponentCanvasChildInstance[]
  | readonly string[]
  | readonly [number, string];

export type ComponentCanvasChildInstance = {
  id: string;
  type: string;
};

export type ComponentCanvasChildDefault =
  | string
  | {
      type: string;
      /**
       * Seed values for this instance's controls, keyed by unscoped control
       * name. A nested children control seeds with its own child-default
       * array, so deep compositions initialize recursively.
       */
      values?: Readonly<
        Record<string, ComponentCanvasValue | readonly ComponentCanvasChildDefault[]>
      >;
    };

type ComponentCanvasControlBase = {
  /** Public prop or gallery-facing value used by the Canvas demo. */
  name: string;
  label?: string;
  description?: string;
  visibleWhen?: {
    control: string;
    equals: string | number | boolean;
  };
};

export type ComponentCanvasFieldControl =
  | (ComponentCanvasControlBase & {
      type: "text";
      default: string;
      placeholder?: string;
    })
  | (ComponentCanvasControlBase & {
      type: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
    })
  | (ComponentCanvasControlBase & {
      type: "boolean";
      default: boolean;
    })
  | (ComponentCanvasControlBase & {
      type: "select";
      default: string;
      options: readonly (
        | string
        | {
            label: string;
            value: string;
          }
      )[];
    })
  | (ComponentCanvasControlBase & {
      type: "options";
      default: readonly [ComponentCanvasOption, ComponentCanvasOption, ...ComponentCanvasOption[]];
    })
  | (ComponentCanvasControlBase & {
      type: "strings";
      default: readonly [string, ...string[]];
    })
  | (ComponentCanvasControlBase & {
      type: "optional-strings";
      default: readonly string[] | null;
      enabledDefault: readonly string[];
    })
  | (ComponentCanvasControlBase & {
      type: "box-value";
      default: string | readonly [number, string];
      namedDefault: string;
      arbitraryDefault: readonly [number, string];
      unitOptions: readonly string[];
    });

export type ComponentCanvasGroupControl = ComponentCanvasControlBase & {
  type: "group";
  /** Optional child field whose string value names this composed component. */
  labelControl?: string;
  /** Public fields and recursive children controls for this component. */
  controls: readonly ComponentCanvasControl[];
};

export type ComponentCanvasChildrenControl = ComponentCanvasControlBase & {
  type: "children";
  /** Component names initially composed at this level. */
  default: readonly ComponentCanvasChildDefault[];
  /** Closed gallery picker for child components valid at this level. */
  options: readonly ComponentCanvasGroupControl[];
  /** Whether the same child component type may be inserted more than once. */
  allowMultiple?: boolean;
};

export type ComponentCanvasControl =
  | ComponentCanvasFieldControl
  | ComponentCanvasGroupControl
  | ComponentCanvasChildrenControl;

type DemoNodeBase = {
  /**
   * Classes for a wrapper element the preview frame adds around the root, in
   * BOTH targets. Demo-only layout (width caps, centring) belongs here rather
   * than inside the demo, or it would appear in one target and not the other.
   */
  wrapper?: string;
};

export type DemoComponentNode = DemoNodeBase & {
  component: string;
  /** Target-neutral public props, including structured component values. */
  props: Record<string, unknown>;
  children?: DemoNode[];
};

export type DemoFragmentNode = DemoNodeBase & {
  /** A gallery composition root for sibling component nodes. */
  fragment: true;
  children: DemoNode[];
};

/**
 * A declarative demo: either one component tree or a fragment of sibling
 * component trees.
 *
 * Both render targets render from this ONE declaration — the DOM target by
 * calling the component functions, the ZSX target through the wasm renderer —
 * so the two are comparable by construction. A demo written as an imperative
 * `Demo()` closure cannot be compared, because the ZSX side has no way to
 * recover what it did.
 */
export type DemoNode = DemoComponentNode | DemoFragmentNode;

export type ComponentCanvas = {
  controls: readonly ComponentCanvasControl[];
  /**
   * Imperative Canvas demo. Mutually exclusive with `node`: a canvas that
   * declares a node renders through it in both targets, so a second hand-written
   * implementation could only drift from it.
   */
  Demo?: (values: Readonly<Record<string, ComponentCanvasValue>>) => JSX.Element;
  /**
   * Map the control values onto a declarative node. Supply this whenever the
   * controls drive a composition rather than one component's own props, and
   * whenever the demo adds layout of its own — without it the two targets
   * render different things.
   */
  node?: (values: Readonly<Record<string, ComponentCanvasValue>>) => DemoNode;
};

type ComponentDemoModuleBase = {
  meta: ComponentDemoMeta;
  canvas?: ComponentCanvas;
  /** Declarative default demo. Required for the default preview to render in ZSX. */
  node?: DemoNode;
};

export type ComponentDemoModule =
  | (ComponentDemoModuleBase & {
      Demo: () => JSX.Element;
      variants?: never;
    })
  | (ComponentDemoModuleBase & {
      Demo?: never;
      variants: ComponentDemoVariant[];
    });
