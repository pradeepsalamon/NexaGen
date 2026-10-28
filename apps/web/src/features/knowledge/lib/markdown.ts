// A small Markdown subset for help articles, parsed to blocks the renderer
// turns into React elements (never HTML strings, so nothing in an article can
// inject markup). Supported: # / ## / ### headings, paragraphs, "-" / "*" /
// "1." lists, "> " quotes, ``` fences (```fen and ```pgn become boards), and
// inline **bold**, *italic*, `code` and [links](/path or https://…).

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; lang: string; text: string };

export type MdInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: MdInline[] };

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  const isBlockStart = (line: string) =>
    /^#{1,3}\s/.test(line) || /^```/.test(line) || /^\s*([-*]|\d+\.)\s+/.test(line) || /^>\s?/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Anything after the language word (```c++, ```js title=x) is ignored, so every
    // line isBlockStart calls a fence really opens one.
    const fence = line.match(/^(`{3,})\s*([A-Za-z0-9_-]*)/);
    if (fence) {
      // Closed only by a run of backticks at least as long as the opener's.
      const closer = new RegExp(`^\`{${fence[1].length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of text)
      blocks.push({ lang: fence[2].toLowerCase(), text: body.join("\n"), type: "code" });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+([\s\S]*)$/);
    if (heading) {
      blocks.push({ level: heading[1].length as 1 | 2 | 3, text: heading[2].trim(), type: "heading" });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ text: body.join(" "), type: "quote" });
      continue;
    }
    const listItem = line.match(/^\s*([-*]|\d+\.)\s+([\s\S]*)$/);
    if (listItem) {
      const ordered = /\d/.test(listItem[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*]|\d+\.)\s+([\s\S]*)$/);
        if (m && /\d/.test(m[1]) === ordered) {
          items.push(m[2]);
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      blocks.push({ items, ordered, type: "list" });
      continue;
    }
    // The first line always goes in, so a line no branch above took can never stall the loop.
    const body: string[] = [lines[i++].trim()];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) body.push(lines[i++].trim());
    blocks.push({ text: body.join(" "), type: "paragraph" });
  }
  return blocks;
}

/** Inline markup, outermost first. Unclosed markers stay as plain text. */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ text: buffer, type: "text" });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      flush();
      out.push({ text: code[1], type: "code" });
      i += code[0].length;
      continue;
    }
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
    if (link) {
      flush();
      out.push({ children: parseInline(link[1]), href: link[2], type: "link" });
      i += link[0].length;
      continue;
    }
    const strong = rest.match(/^\*\*([^*]+)\*\*/);
    if (strong) {
      flush();
      out.push({ children: parseInline(strong[1]), type: "strong" });
      i += strong[0].length;
      continue;
    }
    const em = rest.match(/^(?:\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/);
    if (em && (i === 0 || /[\s(]/.test(text[i - 1]))) {
      flush();
      out.push({ children: parseInline(em[1] ?? em[2]), type: "em" });
      i += em[0].length;
      continue;
    }
    buffer += text[i++];
  }
  flush();
  return out;
}

/** Only site paths and http(s) links are rendered as links; anything else is text. */
export function classifyHref(href: string): "internal" | "external" | "unsafe" {
  // Not "//host" or "/\\host": browsers read both as another site.
  if (/^\/(?![/\\])/.test(href)) return "internal";
  if (/^https?:\/\//i.test(href)) return "external";
  return "unsafe";
}

/** Internal links in a body (for the editor's "not reachable for this audience" check). */
export function internalLinks(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/\[[^\]]+\]\((\/[^)\s]*)\)/g)) found.add(m[1].split(/[?#]/)[0]);
  return [...found];
}
