/** Replace `from`–`to` with `insert`, then select `selectionStart`–`selectionEnd`. */
export type TextEdit = {
  from: number;
  insert: string;
  selectionEnd: number;
  selectionStart: number;
  to: number;
};

/** Marks the selection, or removes the mark if it's already there. Each line separately, as marks can't span a paragraph. */
export function toggleMark(text: string, start: number, end: number, marker: string, emptyLabel: string): TextEdit {
  const size = marker.length;

  if (start === end) {
    const insert = `${marker}${emptyLabel}${marker}`;
    return { from: start, insert, selectionEnd: start + size + emptyLabel.length, selectionStart: start + size, to: end };
  }

  if (text.slice(start - size, start) === marker && text.slice(end, end + size) === marker) {
    const insert = text.slice(start, end);
    return { from: start - size, insert, selectionEnd: start - size + insert.length, selectionStart: start - size, to: end + size };
  }

  const selected = text.slice(start, end);
  const lines = selected.split("\n");
  const marked = lines.every((line) => !line.trim() || (line.trim().startsWith(marker) && line.trim().endsWith(marker)));
  const insert = lines
    .map((line) => {
      if (!line.trim()) return line;
      const [, before, body, after] = line.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? [];
      return marked ? `${before}${body.slice(size, -size)}${after}` : `${before}${marker}${body}${marker}${after}`;
    })
    .join("\n");
  return { from: start, insert, selectionEnd: start + insert.length, selectionStart: start, to: end };
}

const LINE_PREFIX = /^(\s*)(#{1,3}\s+|[-*]\s+|\d+\.\s+)?/;

/** Puts a heading/list prefix on every line the selection touches, or takes it off if they all have it. */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: (index: number) => string): TextEdit {
  const from = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", end);
  const to = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(from, to).split("\n");
  if (lines.length === 1 && !lines[0].trim()) {
    const insert = prefix(0);
    return { from, insert, selectionEnd: from + insert.length, selectionStart: from + insert.length, to };
  }
  const pattern = prefix(0).replace(/\d+/, "\\d+").replace(/[-#.]/g, "\\$&");
  const applied = new RegExp(`^\\s*${pattern}`);
  const allApplied = lines.every((line) => !line.trim() || applied.test(line));

  let index = 0;
  const insert = lines
    .map((line) => {
      if (!line.trim()) return line;
      return line.replace(LINE_PREFIX, (_match, space: string) => (allApplied ? space : `${space}${prefix(index++)}`));
    })
    .join("\n");
  // A caret stays on the same character; a selection covers the lines it now spans.
  const caret = Math.max(from, start + insert.length - (to - from));
  return { from, insert, selectionEnd: start === end ? caret : from + insert.length, selectionStart: start === end ? caret : from, to };
}

export function insertLink(start: number, end: number, label: string, url: string): TextEdit {
  const insert = `[${label.replace(/[[\]]/g, "\\$&")}](${url})`;
  return { from: start, insert, selectionEnd: start + insert.length, selectionStart: start + insert.length, to: end };
}
