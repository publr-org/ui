// Rendered markup, formatted for reading: one tag per line, nested by depth.
export function formatRenderedHtml(source: string): string {
  const normalized = source.trim().replace(/>\s*</g, ">\n<");
  if (!normalized) return "";
  const voidElement = /^<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i;
  let depth = 0;
  return normalized
    .split("\n")
    .map((line) => {
      const value = line.trim();
      if (value.startsWith("</")) depth = Math.max(0, depth - 1);
      const output = `${"  ".repeat(depth)}${value}`;
      if (/^<[^!/][^>]*>/.test(value) && !value.startsWith("</") && !value.endsWith("/>") && !voidElement.test(value) && !/<\/[^>]+>$/.test(value)) {
        depth += 1;
      }
      return output;
    })
    .join("\n");
}

