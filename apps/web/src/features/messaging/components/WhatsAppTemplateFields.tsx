"use client";

import {
  DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_LIMITS,
  findWhatsAppTemplate,
  parseWhatsAppTemplateParams,
  resolveWhatsAppTemplate,
  type MessageVariables
} from "@nexa-chess/types";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/Combobox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { WhatsAppTemplateStatus, useWhatsAppTemplates } from "./WhatsAppTemplateStatus";

/** How a template reads in the picker; also its search text. */
function pickerLabel(template: { language: string; name: string; status: string }): string {
  return `${template.name} (${template.language})${template.status === "APPROVED" ? "" : ` · ${template.status.toLowerCase()}`}`;
}

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
  const templates = useWhatsAppTemplates();
  const account = templates.data?.available ? templates.data.templates : null;
  const byLabel = new Map((account ?? []).map((template) => [pickerLabel(template), template]));
  const picked = account && draft.name.trim() ? findWhatsAppTemplate(account, draft.name, draft.language) : null;
  const typedLines = parseWhatsAppTemplateParams(draft.paramsText).length;
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
        <FormField
          hint={account ? "From your connected WhatsApp account (Messaging → WhatsApp templates lists them all)." : undefined}
          id={`${idPrefix}-tpl`}
          label="Template"
        >
          {account && account.length > 0 ? (
            <Combobox
              id={`${idPrefix}-tpl`}
              items={[...byLabel.keys()]}
              onValueChange={(label) => {
                const template = byLabel.get(label);
                onChange(template ? { ...draft, language: template.language, name: template.name } : { ...draft, language: "", name: "" });
              }}
              value={picked ? pickerLabel(picked) : ""}
            >
              <ComboboxInput placeholder="Choose a template" />
              <ComboboxContent>
                <ComboboxEmpty>No template with that name.</ComboboxEmpty>
                <ComboboxList>
                  {(label) => (
                    <ComboboxItem key={label} value={label}>
                      {label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          ) : (
            <Input
              id={`${idPrefix}-tpl`}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="demo_booking_received"
              value={draft.name}
            />
          )}
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
      <div className="mt-2">
        <WhatsAppTemplateStatus language={draft.language} name={draft.name} />
      </div>
      {picked?.body ? (
        <div className="mt-3 space-y-1 text-xs text-app-muted">
          <p className="font-semibold">Template text</p>
          <p className="whitespace-pre-wrap break-words rounded-app bg-app-soft p-3 text-sm text-app-text">{picked.body}</p>
          <p className={picked.paramCount !== typedLines ? "text-warning-ink" : undefined}>
            {picked.paramCount === 0
              ? "This template has no values to fill; leave the values below empty."
              : `Needs ${picked.paramCount} value${picked.paramCount === 1 ? "" : "s"} below, one per line (you have ${typedLines}).`}
          </p>
        </div>
      ) : null}
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
