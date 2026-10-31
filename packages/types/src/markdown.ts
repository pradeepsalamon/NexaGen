// A small Markdown subset shared by help articles and messages, parsed to
// blocks each channel renders itself (never HTML strings, so nothing in the
// text can inject markup). Supported: # / ## / ### headings, paragraphs, "-" /
// "*" / "1." lists, "> " quotes, ``` fences, inline **bold**, *italic*, `code`,
// [links](/path or https://…), bare http(s) URLs and backslash escapes.

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

export interface ParseMarkdownOptions {
  /** Messages: a single newline stays a line break instead of becoming a space. */
  keepLineBreaks?: boolean;
}

export function parseMarkdown(source: string, options: ParseMarkdownOptions = {}): MdBlock[] {
  const lineJoin = options.keepLineBreaks ? "\n" : " ";
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
      blocks.push({ text: body.join(lineJoin), type: "quote" });
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
    blocks.push({ text: body.join(lineJoin), type: "paragraph" });
  }
  return blocks;
}

const ESCAPABLE = /\\([\\*_`[\]#>.-])/g;
const BARE_URL = /^https?:\/\/[^\s<>"']+/i;
// Sentence punctuation after a URL isn't part of it.
const URL_TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

function unescapeMarkdown(text: string): string {
  return text.replace(ESCAPABLE, "$1");
}

/**
 * Inline markup, outermost first. Unclosed markers stay as plain text. Inside a
 * link's label a URL stays text, so a link can never contain a link.
 */
export function parseInline(text: string, insideLink = false): MdInline[] {
  const out: MdInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ text: buffer, type: "text" });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (/^\\[\\*_`[\]#>.-]/.test(rest)) {
      buffer += rest[1];
      i += 2;
      continue;
    }
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      flush();
      out.push({ text: unescapeMarkdown(code[1]), type: "code" });
      i += code[0].length;
      continue;
    }
    const link = rest.match(/^\[((?:\\.|[^\]\\])+)\]\(([^)\s]+)\)/);
    if (link) {
      flush();
      out.push({ children: parseInline(link[1], true), href: unescapeMarkdown(link[2]), type: "link" });
      i += link[0].length;
      continue;
    }
    const strong = rest.match(/^\*\*((?:\\.|[^*\\])+)\*\*/);
    if (strong) {
      flush();
      out.push({ children: parseInline(strong[1], insideLink), type: "strong" });
      i += strong[0].length;
      continue;
    }
    const em = rest.match(/^(?:\*((?:\\.|[^*\s\\])(?:\\.|[^*\\])*)\*|_((?:\\.|[^_\s\\])(?:\\.|[^_\\])*)_)/);
    if (em && (i === 0 || /[\s(]/.test(text[i - 1]))) {
      flush();
      out.push({ children: parseInline(em[1] ?? em[2], insideLink), type: "em" });
      i += em[0].length;
      continue;
    }
    const url = !insideLink && (i === 0 || !/[\w/]/.test(text[i - 1])) ? rest.match(BARE_URL) : null;
    if (url) {
      const raw = url[0].replace(URL_TRAILING_PUNCTUATION, "");
      if (!raw.endsWith("//")) {
        const href = unescapeMarkdown(raw);
        flush();
        out.push({ children: [{ text: href, type: "text" }], href, type: "link" });
        i += raw.length;
        continue;
      }
    }
    buffer += text[i++];
  }
  flush();
  return out;
}

/** Only site paths and http(s) links are rendered as links; anything else is text. */
export function classifyHref(href: string): "internal" | "external" | "unsafe" {
  // Browsers drop tabs/newlines from URLs ("/\t/host" opens as "//host"), so no control characters at all.
  if (/[\u0000-\u001F\u007F]/.test(href)) return "unsafe";
  // Not "//host" or "/\\host": browsers read both as another site.
  if (/^\/(?![/\\])/.test(href)) return "internal";
  if (/^https?:\/\//i.test(href)) return "external";
  return "unsafe";
}

/**
 * A value going into a message is data, not formatting: a student named
 * "[Pay here](https://…)" must not become a link in someone's email.
 */
export function escapeMarkdown(value: string): string {
  return value
    .replace(/[\\*_`[\]]/g, "\\$&")
    .replace(/^(\s*)(#{1,3}|>|-)(?=\s)/gm, (_match, space: string, marker: string) =>
      `${space}${marker.replace(/./g, "\\$&")}`
    )
    .replace(/^(\s*\d+)\.(?=\s)/gm, "$1\\.");
}

function inlineToText(
  nodes: MdInline[],
  link: (label: string, href: string) => string,
  mark: (kind: "strong" | "em", text: string) => string
): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "strong":
        case "em":
          return mark(node.type, inlineToText(node.children, link, mark));
        case "link":
          return link(inlineToText(node.children, link, mark), node.href);
      }
    })
    .join("");
}

function blocksToText(
  source: string,
  link: (label: string, href: string) => string,
  mark: (kind: "strong" | "em", text: string) => string
): string {
  const inline = (text: string) => inlineToText(parseInline(text), link, mark);
  return parseMarkdown(source, { keepLineBreaks: true })
    .map((block) => {
      switch (block.type) {
        case "heading":
          return mark("strong", inline(block.text));
        case "paragraph":
          return inline(block.text);
        case "quote":
          return inline(block.text)
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
        case "list":
          return block.items
            .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${inline(item)}`)
            .join("\n");
        case "code":
          return block.text;
      }
    })
    .join("\n\n");
}

/** A link's address has to survive where nothing can be clicked, unless the label already is it. */
function linkAsText(label: string, href: string, format: (label: string, href: string) => string): string {
  if (classifyHref(href) !== "external") return label;
  return label === href ? href : format(label, href);
}

/** The email text part, list rows and logs: no markup left, every external address kept. */
export function markdownToPlainText(source: string): string {
  return blocksToText(
    source,
    (label, href) => linkAsText(label, href, (l, h) => `${l} (${h})`),
    (_kind, text) => text
  );
}

/** WhatsApp's own markers: *bold* and _italic_. It links any address it sees. */
export function markdownToWhatsApp(source: string): string {
  return blocksToText(
    source,
    (label, href) => linkAsText(label, href, (l, h) => `${l}: ${h}`),
    (kind, text) => {
      // A marker around whitespace or a line break shows literally.
      if (!text.trim() || text.includes("\n")) return text;
      return kind === "strong" ? `*${text}*` : `_${text}_`;
    }
  );
}

export type TextSegment = { text: string; href?: string };

/** For text nobody formatted, like chat: every http(s) address becomes a link, nothing else changes. */
export function splitTextLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const href = match[0].replace(URL_TRAILING_PUNCTUATION, "");
    if (href.endsWith("//")) continue;
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
    segments.push({ href, text: href });
    cursor = match.index + href.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
