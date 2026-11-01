"use client";

import { useRef } from "react";
import { MESSAGE_VARIABLE_DOCS } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";

type Field = { onChange: (next: string) => void; value: string };

/**
 * Puts a placeholder at the cursor of whichever field was focused last. Until
 * one has been, it goes at the end of the message.
 */
export function useTemplateInsert(fields: { body: Field; heading?: Field }) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLInputElement>(null);
  const focused = useRef<"body" | "heading" | null>(null);

  const insert = (name: string) => {
    const target = focused.current === "heading" ? fields.heading : fields.body;
    const element = focused.current === "heading" ? headingRef.current : bodyRef.current;
    if (!target || !element) return;

    const token = `{{${name}}}`;
    const start = focused.current ? (element.selectionStart ?? target.value.length) : target.value.length;
    const end = focused.current ? (element.selectionEnd ?? start) : start;
    target.onChange(target.value.slice(0, start) + token + target.value.slice(end));

    // After React has written the new value, or the caret jumps to the end.
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    });
  };

  /** For a dialog's auto-focus, which would otherwise select the first field for overwriting. */
  const focusBodyEnd = () => {
    const element = bodyRef.current;
    element?.focus();
    element?.setSelectionRange(element.value.length, element.value.length);
  };

  return {
    bodyProps: { onFocus: () => (focused.current = "body"), ref: bodyRef },
    focusBodyEnd,
    headingProps: { onFocus: () => (focused.current = "heading"), ref: headingRef },
    insert
  };
}

export function PlaceholderPicker({
  onInsert,
  variables
}: {
  onInsert: (name: string) => void;
  variables: readonly string[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-app-muted">Placeholders</p>
      <p className="mt-1 text-xs text-app-muted">
        Each one is replaced with the real value when the message is sent. Examples are shown here.
      </p>
      <ul className="mt-2 max-h-64 divide-y divide-app-border overflow-y-auto rounded-control border border-app-border">
        {variables.map((name) => {
          const doc = MESSAGE_VARIABLE_DOCS[name];
          return (
            <li className="flex items-center justify-between gap-3 px-3 py-2" key={name}>
              <div className="min-w-0">
                <p className="break-all text-xs font-semibold text-app-text">{`{{${name}}}`}</p>
                {doc ? (
                  <p className="mt-0.5 text-xs text-app-muted [overflow-wrap:anywhere]">
                    {doc.label}: <span className="text-app-text">{doc.sample}</span>
                  </p>
                ) : null}
              </div>
              <Button
                aria-label={`Insert ${name}`}
                className="shrink-0"
                onClick={() => onInsert(name)}
                size="sm"
                type="button"
                variant="outline"
              >
                Insert
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
