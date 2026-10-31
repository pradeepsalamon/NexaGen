import { classifyHref, parseInline, parseMarkdown, type MdInline } from "@nexa-chess/types";

export const EMAIL_LINK_STYLE = "color:#1d4ed8;font-weight:600;text-decoration:underline";

const BLOCK_MARGIN = "margin:0 0 12px";

/** A message body as email HTML. Everything is escaped; only the formatting becomes markup. */
export function messageToEmailHtml(source: string): string {
  const inline = (text: string) => inlineToHtml(parseInline(text)).replace(/\n/g, "<br>");

  return parseMarkdown(source, { keepLineBreaks: true })
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<p style="${BLOCK_MARGIN};font-size:17px;font-weight:700">${inline(block.text)}</p>`;
        case "paragraph":
          return `<p style="${BLOCK_MARGIN}">${inline(block.text)}</p>`;
        case "quote":
          return `<blockquote style="${BLOCK_MARGIN};padding:4px 12px;border-left:3px solid #d0d5dd;color:#475467">${inline(block.text)}</blockquote>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const items = block.items.map((item) => `<li>${inline(item)}</li>`).join("");
          return `<${tag} style="${BLOCK_MARGIN};padding-left:24px">${items}</${tag}>`;
        }
        case "code":
          return `<pre style="${BLOCK_MARGIN};font-family:monospace;white-space:pre-wrap">${escapeHtml(block.text)}</pre>`;
      }
    })
    .join("");
}

function inlineToHtml(nodes: MdInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escapeHtml(node.text);
        case "code":
          return `<code>${escapeHtml(node.text)}</code>`;
        case "strong":
          return `<strong>${inlineToHtml(node.children)}</strong>`;
        case "em":
          return `<em>${inlineToHtml(node.children)}</em>`;
        case "link":
          // An email has no site to resolve a path against, so only a full address links.
          return classifyHref(node.href) === "external"
            ? `<a href="${escapeHtml(node.href)}" style="${EMAIL_LINK_STYLE}">${inlineToHtml(node.children)}</a>`
            : inlineToHtml(node.children);
      }
    })
    .join("");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
