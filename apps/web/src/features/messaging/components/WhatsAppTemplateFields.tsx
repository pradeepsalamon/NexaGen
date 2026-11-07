"use client";

import {
  DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_LIMITS,
  parseWhatsAppTemplateParams,
  resolveWhatsAppTemplate,
  type MessageVariables
} from "@nexa-chess/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

export interface WhatsAppTemplateDraft {
  name: string;
  language: string;
  /** The textarea's own text, one value per line; parsed only on save so typing isn't stripped. */
  paramsText: string;
}

export function templateDraftFrom(saved: { name: string | null; language: string | null; params: readonly string[] }) {
  return { language: saved.language ?? "", name: saved.name ?? "", paramsText: saved.params.join("\n") };
}

/** The request fields for a draft: empty name/language = none. */
export function templateFieldsFrom(draft: WhatsAppTemplateDraft) {
  return {
    whatsappTemplateLanguage: draft.language.trim() || null,
    whatsappTemplateName: draft.name.trim() || null,
    whatsappTemplateParams: parseWhatsAppTemplateParams(draft.paramsText)
  };
}

/**
 * The approved-template section of a messaging rule or a system message (the API validates
 * the same rules: `whatsappTemplateIssues`). `issues` come from the caller so it can also
 * block saving on them.
 */
export function WhatsAppTemplateFields({
  draft,
  idPrefix,
  issues,
  onChange,
  samples
}: {
  draft: WhatsAppTemplateDraft;
  idPrefix: string;
  issues: string[];
  onChange: (draft: WhatsAppTemplateDraft) => void;
  /** Example values, for the preview of what fills each slot. */
  samples: MessageVariables;
}) {
  const resolved = resolveWhatsAppTemplate(
    { language: draft.language, name: draft.name, params: parseWhatsAppTemplateParams(draft.paramsText) },
    samples
  );

  return (
    <details className="rounded-app border border-app-border p-4" open={Boolean(draft.name.trim()) || undefined}>
      <summary className="cursor-pointer text-sm font-semibold text-app-text">
        Approved WhatsApp template (optional)
      </summary>
      <p className="mt-2 text-xs text-app-muted">
        WhatsApp only delivers free-form text within 24 hours of the person&apos;s last message to the academy. To
        reach anyone else, name a template approved in WhatsApp Manager. It is sent instead of the text above,
        and its {"{{1}}, {{2}}"}… slots are filled from the values below, in order. Leave the name empty to send
        the text.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-tpl`} label="Template name">
          <Input
            id={`${idPrefix}-tpl`}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="demo_booking_received"
            value={draft.name}
          />
        </FormField>
        <FormField
          hint={`Leave empty for ${DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE}.`}
          id={`${idPrefix}-lang`}
          label="Language code"
        >
          <Input
            id={`${idPrefix}-lang`}
            onChange={(e) => onChange({ ...draft, language: e.target.value })}
            placeholder={DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE}
            value={draft.language}
          />
        </FormField>
      </div>
      <FormField
        hint={`One per line, at most ${WHATSAPP_TEMPLATE_LIMITS.maxParams}; each may use this message's placeholders. The count must match the template's slots.`}
        id={`${idPrefix}-params`}
        label="Template values, one per line"
      >
        <Textarea
          id={`${idPrefix}-params`}
          onChange={(e) => onChange({ ...draft, paramsText: e.target.value })}
          placeholder={"{{recipient.firstName}}\n{{links.login}}"}
          rows={3}
          value={draft.paramsText}
        />
      </FormField>
      {issues.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-app-danger-ink" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : resolved && resolved.bodyParams.length > 0 ? (
        <div className="mt-2 text-xs text-app-muted">
          <p className="font-semibold">With example values</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {resolved.bodyParams.map((value, index) => (
              <li className="break-words" key={index}>
                {"{{"}
                {index + 1}
                {"}}"} = {value || "(empty)"}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </details>
  );
}
