"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes
} from "react";
import { Bold, Eye, Heading2, Italic, Link2, List, ListOrdered, type LucideIcon } from "lucide-react";
import { classifyHref } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { FormattedText } from "@/components/ui/FormattedText";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { insertLink, toggleLinePrefix, toggleMark, type TextEdit } from "@/lib/textFormatting";
import { cn } from "@/lib/utils";

/** "full": any https address. "template": a placeholder too. "site": a path on this site too. */
type LinkTargets = "full" | "site" | "template";

const LINK_HINTS: Record<LinkTargets, string> = {
  full: "A full address, like https://example.com.",
  site: "A full address, or a page on this site like /student/schedule.",
  template: "A full address, or a link placeholder like {{links.class}}."
};

function readLinkTarget(raw: string, targets: LinkTargets): string | null {
  const url = raw.trim();
  if (targets === "template" && /^\{\{\s*[\w.]+\s*\}\}$/.test(url)) return url;
  const kind = classifyHref(url);
  if (kind === "external" || (kind === "internal" && targets === "site")) return url;
  // People paste "example.com" far more often than the whole address.
  if (/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(url)) return `https://${url}`;
  return null;
}

type TextEditorProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
  hasError?: boolean;
  linkTargets?: LinkTargets;
  onChange: (next: string) => void;
  /** Adds a Preview button. For a form that doesn't already show its own preview. */
  previewable?: boolean;
  value: string;
};

/**
 * The app's formatted text field: a Textarea with a toolbar. It stores readable
 * text (**bold**, _italic_, - lists, [links](…)) that `FormattedText`, the email
 * renderer and the WhatsApp converter all read, never HTML. Use it only where the
 * text is displayed through one of those; everything else stays a plain Textarea.
 */
export const TextEditor = forwardRef<HTMLTextAreaElement, TextEditorProps>(function TextEditor(
  { className, disabled, id, linkTargets = "full", maxLength, onChange, onKeyDown, previewable = false, value, ...props },
  ref
) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => textarea.current as HTMLTextAreaElement);

  const [previewing, setPreviewing] = useState(false);
  const [link, setLink] = useState<{ end: number; label: string; start: number; url: string } | null>(null);
  const toolsDisabled = disabled || previewing;

  const apply = (edit: TextEdit) => {
    const element = textarea.current;
    if (!element) return;
    const next = value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
    if (maxLength !== undefined && next.length > maxLength && next.length > value.length) return;

    // Through the browser's own edit when it can, so Ctrl+Z undoes it.
    element.focus();
    element.setSelectionRange(edit.from, edit.to);
    let handled = false;
    try {
      handled = document.execCommand("insertText", false, edit.insert);
    } catch {
      handled = false;
    }
    if (!handled) onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  const selection = () => {
    const element = textarea.current;
    return { end: element?.selectionEnd ?? value.length, start: element?.selectionStart ?? value.length };
  };

  const mark = (marker: string, emptyLabel: string) => {
    const { end, start } = selection();
    apply(toggleMark(value, start, end, marker, emptyLabel));
  };

  const linePrefix = (prefix: (index: number) => string) => {
    const { end, start } = selection();
    apply(toggleLinePrefix(value, start, end, prefix));
  };

  const openLink = () => {
    if (link) {
      setLink(null);
      return;
    }
    const { end, start } = selection();
    setLink({ end, label: value.slice(start, end), start, url: "" });
  };

  const linkTarget = link ? readLinkTarget(link.url, linkTargets) : null;

  const addLink = () => {
    if (!link || !linkTarget) return;
    apply(insertLink(link.start, link.end, link.label.trim() || linkTarget, linkTarget));
    setLink(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i" && key !== "k") return;
    event.preventDefault();
    if (key === "b") mark("**", "bold text");
    if (key === "i") mark("_", "italic text");
    if (key === "k") openLink();
  };

  const tool = (label: string, Icon: LucideIcon, onClick: () => void, pressed?: boolean, isDisabled = toolsDisabled): ReactNode => (
    <SimpleTooltip label={label}>
      <Button
        aria-label={label}
        aria-pressed={pressed}
        className={cn("size-8 rounded-control p-0", pressed && "bg-primary/10 text-primary-ink")}
        disabled={isDisabled}
        onClick={onClick}
        onMouseDown={(event) => event.preventDefault()}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      </Button>
    </SimpleTooltip>
  );

  return (
    <div className="space-y-1.5">
      <div aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5" role="toolbar">
        {tool("Bold (Ctrl+B)", Bold, () => mark("**", "bold text"))}
        {tool("Italic (Ctrl+I)", Italic, () => mark("_", "italic text"))}
        {tool("Heading", Heading2, () => linePrefix(() => "## "))}
        {tool("Bulleted list", List, () => linePrefix(() => "- "))}
        {tool("Numbered list", ListOrdered, () => linePrefix((index) => `${index + 1}. `))}
        {tool("Link (Ctrl+K)", Link2, openLink, link !== null)}
        {previewable ? (
          <span className="ml-auto">{tool("Preview", Eye, () => setPreviewing((on) => !on), previewing, disabled)}</span>
        ) : null}
      </div>

      {link && !previewing ? (
        <div className="grid gap-2 rounded-control border border-app-border bg-app-soft p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Input
            aria-label="Link text"
            onChange={(event) => setLink({ ...link, label: event.target.value })}
            placeholder="Text to show"
            value={link.label}
          />
          <Input
            aria-label="Link address"
            autoFocus
            onChange={(event) => setLink({ ...link, url: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addLink();
            }}
            placeholder={linkTargets === "template" ? "https://… or {{links.class}}" : "https://…"}
            value={link.url}
          />
          <Button disabled={!linkTarget} onClick={addLink} type="button" variant="outline">
            Add link
          </Button>
          <p className="text-xs text-app-muted sm:col-span-3">{LINK_HINTS[linkTargets]}</p>
        </div>
      ) : null}

      {previewing ? (
        <div className="min-h-24 rounded-[20px] border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text">
          {value.trim() ? <FormattedText source={value} /> : <p className="text-app-muted">Nothing to preview yet.</p>}
        </div>
      ) : (
        <Textarea
          className={className}
          disabled={disabled}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          ref={textarea}
          value={value}
          {...props}
        />
      )}
    </div>
  );
});
TextEditor.displayName = "TextEditor";
