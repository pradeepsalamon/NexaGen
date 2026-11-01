"use client";

import { Fragment, useMemo, type HTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { classifyHref, parseInline, parseMarkdown, splitTextLinks, type MdInline } from "@nexa-chess/types";
import { cn } from "@/lib/utils";

const LINK_CLASS = "font-semibold text-primary-ink underline underline-offset-2 [overflow-wrap:anywhere]";
// On a coloured surface (your own chat bubble) the link colour would disappear.
const LINK_ON_COLOUR_CLASS = "font-semibold text-inherit underline underline-offset-2 [overflow-wrap:anywhere]";

function ExternalLink({ children, className, href }: { children: ReactNode; className: string; href: string }) {
  return (
    <a className={className} href={href} rel="noopener noreferrer nofollow" target="_blank">
      {children}
    </a>
  );
}

/** Text someone typed with no formatting, like chat. Addresses become links, nothing else changes. */
export function LinkedText({ onColour = false, text }: { onColour?: boolean; text: string }): ReactNode {
  const segments = useMemo(() => splitTextLinks(text), [text]);
  return segments.map((segment, i) =>
    segment.href ? (
      <ExternalLink className={onColour ? LINK_ON_COLOUR_CLASS : LINK_CLASS} href={segment.href} key={i}>
        {segment.text}
      </ExternalLink>
    ) : (
      <Fragment key={i}>{segment.text}</Fragment>
    )
  );
}

type FormattedTextProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Live class only: a page link opens in a new tab instead of unmounting the room. */
  pageLinksInNewTab?: boolean;
  source: string;
};

/**
 * A message written in `TextEditor`, inheriting the surrounding text size and
 * colour. Built as React elements, so nothing in the text can inject markup.
 */
export function FormattedText({ className, pageLinksInNewTab = false, source, ...props }: FormattedTextProps) {
  const blocks = useMemo(() => parseMarkdown(source, { keepLineBreaks: true }), [source]);
  const inline = (text: string) => <Inline newTab={pageLinksInNewTab} nodes={parseInline(text)} />;

  return (
    <div className={cn("space-y-2 whitespace-pre-wrap [overflow-wrap:anywhere]", className)} {...props}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <p className="font-bold" key={i}>
                {inline(block.text)}
              </p>
            );
          case "paragraph":
            return <p key={i}>{inline(block.text)}</p>;
          case "quote":
            return (
              <blockquote className="border-l-4 border-primary/40 pl-3" key={i}>
                {inline(block.text)}
              </blockquote>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag className={cn("space-y-0.5 pl-5", block.ordered ? "list-decimal" : "list-disc")} key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ListTag>
            );
          }
          case "code":
            return (
              <pre className="overflow-x-auto rounded-control bg-app-soft p-2 font-mono" key={i}>
                {block.text}
              </pre>
            );
        }
      })}
    </div>
  );
}

function Inline({ newTab, nodes }: { newTab: boolean; nodes: MdInline[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.text}</Fragment>;
      case "code":
        return (
          <code className="rounded bg-app-soft px-1 font-mono" key={i}>
            {node.text}
          </code>
        );
      case "strong":
        return (
          <strong className="font-bold" key={i}>
            <Inline newTab={newTab} nodes={node.children} />
          </strong>
        );
      case "em":
        return (
          <em key={i}>
            <Inline newTab={newTab} nodes={node.children} />
          </em>
        );
      case "link": {
        const kind = classifyHref(node.href);
        const children = <Inline newTab={newTab} nodes={node.children} />;
        if (kind === "external" || (kind === "internal" && newTab)) {
          return (
            <ExternalLink className={LINK_CLASS} href={node.href} key={i}>
              {children}
            </ExternalLink>
          );
        }
        if (kind === "internal") {
          return (
            <Link className={LINK_CLASS} href={node.href} key={i}>
              {children}
            </Link>
          );
        }
        return <Fragment key={i}>{children}</Fragment>;
      }
    }
  });
}
