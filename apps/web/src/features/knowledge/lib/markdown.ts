export { classifyHref, parseInline, parseMarkdown, type MdBlock, type MdInline } from "@nexa-chess/types";

/** Internal links in a body (for the editor's "not reachable for this audience" check). */
export function internalLinks(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/\[[^\]]+\]\((\/[^)\s]*)\)/g)) found.add(m[1].split(/[?#]/)[0]);
  return [...found];
}
