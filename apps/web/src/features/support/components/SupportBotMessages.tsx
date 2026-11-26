"use client";

import { useMemo, useSyncExternalStore } from "react";
import { MousePointerClick } from "lucide-react";
import {
  supportBotScript,
  supportMenuEntries,
  type SupportBotAnswer,
  type SupportBotScriptStep,
  type SupportMenuItem,
  type SupportReply
} from "@nexa-chess/types";
import { LinkedText } from "@/components/ui/FormattedText";
import { SectionCard } from "@/components/ui/SectionCard";
import { cn } from "@/lib/utils";
import { useSupportSavedRepliesQuery } from "../hooks/useSupportAdmin";

const noSubscribe = () => () => undefined;

/** This page's own address, for the privacy link in the greeting (empty while rendering on the server). */
function usePageOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}

/**
 * Every message the bot sends on its own, as sample conversations (Support → Settings).
 * Made by running the bot itself (`supportBotScript`), so it always matches what parents
 * get, with this page's menu and away message as they are being edited.
 */
export function SupportBotMessages({
  academyName,
  menu,
  outOfHoursMessage
}: {
  academyName: string;
  menu: SupportMenuItem[];
  outOfHoursMessage: string;
}) {
  const origin = usePageOrigin();
  const saved = useSupportSavedRepliesQuery();
  const answers = useMemo<SupportBotAnswer[]>(
    () =>
      (saved.data ?? [])
        .filter((reply) => reply.showInBot)
        .map(({ body, description, id, keywords, title }) => ({ body, description, id, keywords, title })),
    [saved.data]
  );
  const sections = useMemo(
    () =>
      supportBotScript(
        { academyName, answers, menu: supportMenuEntries(menu), privacyUrl: `${origin}/privacy` },
        { outOfHoursMessage }
      ),
    [academyName, answers, menu, origin, outOfHoursMessage]
  );

  return (
    <SectionCard
      description="Everything the bot says by itself, shown as sample conversations. It is made from the bot, so it always matches what parents get, including your menu and saved answers. Your saved answers' own text is on the Saved answers page."
      title="Bot messages"
    >
      <div className="grid gap-3">
        {sections.map((section, index) => (
          <details className="group rounded-control border border-app-border" key={section.id} open={index === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 font-semibold text-app-text [&::-webkit-details-marker]:hidden">
              <span>{section.title}</span>
              <span aria-hidden="true" className="text-sm text-app-muted transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="grid gap-3 border-t border-app-border px-3 pb-4 pt-3">
              <p className="text-sm text-app-muted">{section.description}</p>
              {section.steps.map((step, stepIndex) => (
                <ScriptStep key={stepIndex} step={step} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}

function ScriptStep({ step }: { step: SupportBotScriptStep }) {
  return (
    <div className="grid gap-1.5">
      {step.note ? <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">{step.note}</p> : null}
      {step.sent ? (
        <div className="flex justify-end">
          <div className="flex max-w-[85%] items-center gap-1.5 rounded-app border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text sm:max-w-[70%]">
            {step.sent.kind === "tap" ? (
              <MousePointerClick aria-label="Taps" className="size-4 shrink-0 text-app-muted" strokeWidth={2.25} />
            ) : null}
            <span className="whitespace-pre-wrap break-words">{step.sent.text}</span>
          </div>
        </div>
      ) : null}
      {step.replies.map((reply, index) => (
        <BotReply key={index} reply={reply} />
      ))}
    </div>
  );
}

function BotReply({ reply }: { reply: SupportReply }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-app bg-app-soft px-3 py-2 text-sm text-app-text sm:max-w-[70%]">
        <LinkedText text={reply.body} />
      </div>
      {reply.kind === "buttons" ? (
        <div className="flex max-w-[85%] flex-wrap gap-1.5 sm:max-w-[70%]">
          {reply.buttons.map((button) => (
            <Chip key={button.id}>{button.title}</Chip>
          ))}
        </div>
      ) : null}
      {reply.kind === "list" ? (
        <div className="grid w-full max-w-[85%] gap-1 sm:max-w-[70%]">
          <Chip>{reply.button}</Chip>
          <ul className="grid gap-1 rounded-control border border-app-border p-2 text-sm">
            {reply.rows.map((row) => (
              <li key={row.id}>
                <span className="font-semibold text-app-text">{row.title}</span>
                {row.description ? <span className="text-app-muted"> · {row.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className={cn("inline-flex w-fit items-center rounded-control border border-app-border bg-app-surface px-3 py-1 text-sm font-semibold text-primary-ink")}>
      {children}
    </span>
  );
}
