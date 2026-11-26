import type { ClassRecapContent } from "@nexa-chess/types";
import { Sparkles } from "lucide-react";

/** A recap as students read it. `aiLabel` is shown above it when given. */
export function ClassRecapContentView({ aiLabel, content }: { aiLabel?: string; content: ClassRecapContent }) {
  return (
    <div className="space-y-4">
      {aiLabel ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-app-muted">
          <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          {aiLabel}
        </p>
      ) : null}
      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-app-text">{content.recap}</p>
      {content.keyPoints.length ? (
        <div>
          <h3 className="text-sm font-bold text-app-text">Key ideas</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-app-text">
            {content.keyPoints.map((point, index) => (
              <li className="break-words" key={index}>
                {point}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {content.practice.length ? (
        <div>
          <h3 className="text-sm font-bold text-app-text">Practise at home</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-app-text">
            {content.practice.map((idea, index) => (
              <li className="break-words" key={index}>
                {idea}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
