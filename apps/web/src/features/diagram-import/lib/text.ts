// The document reader's text as the recognizer wants it: board coordinates printed as
// one run ("a b c d e f g h") spread out so each letter can be matched to a file.

import type { DiagramTextItem } from "@nexa-chess/types";
import type { DocumentTextItem } from "@/lib/document-reader";

export function toDiagramText(items: DocumentTextItem[]): DiagramTextItem[] {
  return items.flatMap(({ centerY, left, text, width }) => {
    const compact = text.replace(/\s+/g, "");
    if (compact.length > 1 && compact.length <= 8 && (/^[a-h]+$/.test(compact) || /^[1-8]+$/.test(compact))) {
      const step = width / compact.length;
      return [...compact].map((ch, i) => ({ text: ch, x: left + step * (i + 0.5), y: centerY }));
    }
    return [{ text, width, x: left + width / 2, y: centerY }];
  });
}
