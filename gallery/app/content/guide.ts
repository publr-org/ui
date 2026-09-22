export const guide = {
  title: "Publr UI design system",
  description:
    "A documented set of primitives, composites, and rules for building Publr interfaces consistently.",
  paragraphs: [
    "This standalone gallery is the working contract for Publr UI. It shows components in isolation, documents why they exist, and records the decisions that should remain consistent across products.",
    "Primitives provide focused capabilities and composition freedom. Composites represent named product patterns and deliberately own more decisions, such as typography, semantics, and layout. If a composite requires every caller to reconstruct its intended appearance, that decision belongs inside the composite instead.",
    "Every example is the production component, rendered by the runtime the browser ships, with its classes compiled by the Publr JIT in the browser. Light and dark specimens are rendered together so shell styles cannot affect a component and a component cannot accidentally work in only one appearance.",
  ],
  principles: [
    {
      title: "Compose from the smallest useful primitive",
      description:
        "Icon, Text, Button, Input, RangePicker, and RangeScalePicker should remain reusable. Named composites assemble them into stable product patterns.",
    },
    {
      title: "Consistency before unnecessary flexibility",
      description:
        "A generic primitive exposes escape hatches. A product-specific composite fixes choices that should not vary between call sites.",
    },
    {
      title: "Semantics and appearance are separate decisions",
      description:
        "Heading level describes the document outline; heading size describes appearance. Accessible labels describe controls even when visible content is only an icon.",
    },
    {
      title: "Design decisions are closed and reviewable",
      description:
        "Typography sizes live in Text's semantic variant map. Adding another role is an explicit design-system decision, not an arbitrary class at a call site.",
    },
  ],
  workflow: [
    "Start with the Usage guidelines page for the component you intend to use.",
    "Choose the narrowest component whose contract matches the UI. Prefer a composite when the pattern already has a product meaning.",
    "Inspect each example in both appearances and test its interaction with keyboard and pointer input.",
    "Use class and style escapes only for concerns the component intentionally leaves to its caller.",
    "When a recurring escape becomes necessary at several call sites, reconsider the component contract instead of copying the workaround.",
  ],
  agentRules: [
    "Treat component documentation as constraints, not visual inspiration.",
    "Do not introduce text-size utilities in components or demos outside Text's variant map.",
    "Keep accessible names as strings even when visible content is composed from Text and Icon.",
    "Do not make named composites accept arbitrary title markup when the composite owns title semantics and typography.",
    "Use the real component examples as implementation references; do not recreate their appearance with parallel custom CSS.",
  ],
} as const;
