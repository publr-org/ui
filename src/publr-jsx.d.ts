// Ambient declarations for PTSX. pjsx/scripts/check-types.mjs canonicalizes
// directives and resolves each component's actual TypeScript exports.

// Minimal typed surface of the vendored publr-jsx runtime (vite aliases the
// bare specifier to vendor/publr/publr-jsx.js; dist ships no .d.ts).
declare module "publr-jsx" {
  export const Publr: typeof import("../../publr-js/src/publr").Publr & {
    /** Explicit Publr directive vocabulary, erased by compilation. */
    dataset(name: string): string;
  };
  export type Child = Node | string | number | boolean | null | undefined | (() => unknown);
  export type Component<P = Record<string, unknown>> = (props: P) => Node;
  export function h(tag: unknown, props?: object | null, ...children: Child[]): Node;
  export function Fragment(props: { children?: Child }): DocumentFragment;
  export function mount<P>(host: Element, component: (props?: P) => Node, props?: P): () => void;
  /** Register class-conflict groups up front. */
  export function useClassGroups(table: Record<string, readonly [string, readonly string[]]>): void;
  /** Synchronous resolver for classes not yet tabled (the live JIT engine); null = not ready. */
  export function setClassResolver(
    resolver:
      | ((
          classes: readonly string[],
        ) => Record<string, readonly [string, readonly string[]]> | null)
      | null,
  ): void;
  export function when(cond: () => unknown, make: () => Child, alt?: () => Child): Node;
  export function list(
    src: () => ArrayLike<unknown> | null | undefined,
    key: (item: never, index: number) => unknown,
    make: (item: never, index: number) => Child,
  ): Node;
  export function show<T extends Element>(el: T, cond: () => unknown): T;
  export function insert(value: () => unknown): Node;
  /** Derive up to two uppercase initials from a person's name ("Dawid Urbanski" → "DU").
   * Dual-target vocabulary: PJSX lowers calls to the zsx runtime's initialsRt. */
  export function initials(name: string): string;
  /** Gravatar URL (MD5 of the normalized email, d=blank) — dual-target, lowers to zsx.gravatarUrlRt. */
  export function gravatarUrl(email: string, size: number): string;
  export function attr(element: Element, name: string, value: () => unknown): void;
  export function classes(element: Element, value: () => unknown): void;
  export function component<P>(make: Component<P>, props: P): Node;
  export function Dynamic(
    props: Record<string, unknown> & { as: string | Element; children?: unknown },
  ): Node;
  export function Slot(props: Record<string, unknown> & { children: JSX.Element }): Node;
}

// Renderable slots in PTSX include all non-thunk values accepted as children.
declare namespace JSX {
  type Element = Node | string | number | boolean | null | undefined | readonly Element[];
  interface ElementChildrenAttribute {
    children: {};
  }
  interface IntrinsicAttributes {
    key?: string | number;
  }
  type LibraryManagedAttributes<C, P> = P & Omit<RootAttributes, keyof P>;
  interface RootAttributes {
    ref?: ((element: any) => void) | { current: globalThis.Element | null };
    hidden?: boolean;
    onClick?: (event: any) => void;
    onInput?: (event: any) => void;
    onCompositionEnd?: (event: CompositionEvent) => void;
  }
  interface IntrinsicElements {
    [tagName: string]: any;
  }
}
