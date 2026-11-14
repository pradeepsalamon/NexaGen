"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import {
  SYSTEM_MESSAGE_DEFINITIONS,
  findMissingRequiredVariables,
  findUnknownSystemMessageVariables,
  renderFormattedTemplate,
  renderMessageTemplate,
  sampleVariables,
  type SystemMessageItem
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  isCoarsePointer
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { FormattedText } from "@/components/ui/FormattedText";
import { Input } from "@/components/ui/Input";
import { TextEditor } from "@/components/ui/TextEditor";
import { useTestSystemMessage, useUpdateSystemMessage } from "../hooks/useMessagingApi";
import { PlaceholderPicker, useTemplateInsert } from "./PlaceholderPicker";

type Props = {
  message: SystemMessageItem;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function SystemMessageEditor({ message, onOpenChange, open }: Props) {
  const definition = SYSTEM_MESSAGE_DEFINITIONS[message.key];
  const isEmail = definition.channel === "EMAIL";
  const update = useUpdateSystemMessage();
  const test = useTestSystemMessage();

  const [subject, setSubject] = useState(message.subject ?? "");
  const [body, setBody] = useState(message.body);
  const [actionLabel, setActionLabel] = useState(message.actionLabel ?? "");
  const [testNumber, setTestNumber] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubject(message.subject ?? "");
      setBody(message.body);
      setActionLabel(message.actionLabel ?? "");
      setTestResult(null);
    }
  }, [message, open]);

  const { bodyProps, focusBodyEnd, headingProps, insert } = useTemplateInsert({
    body: { onChange: setBody, value: body },
    ...(isEmail ? { heading: { onChange: setSubject, value: subject } } : {})
  });

  const samples = useMemo(() => sampleVariables(definition.variables), [definition.variables]);
  const unknown = findUnknownSystemMessageVariables(message.key, `${subject} ${body}`);
  const missing = findMissingRequiredVariables(message.key, body);
  const incomplete =
    !body.trim() ||
    missing.length > 0 ||
    (isEmail && !subject.trim()) ||
    (Boolean(definition.actionVariable) && !actionLabel.trim());

  const restoreDefault = () => {
    setSubject(definition.defaults.subject ?? "");
    setBody(definition.defaults.body);
    setActionLabel(definition.defaults.actionLabel ?? "");
  };

  const save = () => {
    update.mutate(
      {
        data: {
          actionLabel: definition.actionVariable ? actionLabel : null,
          body,
          subject: isEmail ? subject : null
        },
        key: message.key
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const sendTest = () => {
    test.mutate(
      { data: testNumber.trim() ? { phoneNumber: testNumber.trim() } : {}, key: message.key },
      {
        onSuccess: (result) =>
          setTestResult(result.sent ? `Sent to ${result.to}.` : (result.error ?? "Could not send."))
      }
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[90dvh] max-w-2xl overflow-y-auto"
        onOpenAutoFocus={(event) => {
          if (isCoarsePointer()) return;
          event.preventDefault();
          focusBodyEnd();
        }}
      >
        <DialogHeader>
          <DialogTitle>{definition.label}</DialogTitle>
          <DialogDescription>
            {definition.description} Goes to: {definition.sentTo.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {isEmail ? (
            <FormField id={`${message.key}-subject`} label="Subject">
              <Input
                {...headingProps}
                id={`${message.key}-subject`}
                onChange={(e) => setSubject(e.target.value)}
                value={subject}
              />
            </FormField>
          ) : null}

          <FormField
            hint={isEmail ? undefined : "WhatsApp shows bold and italic. A link is written out as its address."}
            id={`${message.key}-body`}
            label="Message"
          >
            <TextEditor
              {...bodyProps}
              id={`${message.key}-body`}
              linkTargets="template"
              onChange={setBody}
              rows={7}
              value={body}
            />
          </FormField>

          {definition.actionVariable ? (
            <FormField
              hint="The button and its link are added below the message automatically."
              id={`${message.key}-action`}
              label="Button label"
            >
              <Input
                id={`${message.key}-action`}
                onChange={(e) => setActionLabel(e.target.value)}
                value={actionLabel}
              />
            </FormField>
          ) : null}

          <PlaceholderPicker onInsert={insert} variables={definition.variables} />

          {missing.length > 0 ? (
            <p className="text-xs text-app-danger-ink">
              This message must include {missing.map((name) => `{{${name}}}`).join(", ")}.
            </p>
          ) : null}
          {unknown.length > 0 ? (
            <p className="text-xs text-app-danger-ink">
              {unknown.map((name) => `{{${name}}}`).join(", ")} — this message cannot fill that in, so it
              will send as empty.
            </p>
          ) : null}

          <div className="rounded-app border border-app-border bg-app-background p-4">
            <p className="text-xs font-semibold text-app-muted">Preview (example values)</p>
            {isEmail ? (
              <p className="mt-2 break-words text-sm font-semibold text-app-text">
                {renderMessageTemplate(subject, samples)}
              </p>
            ) : null}
            <FormattedText className="mt-2 text-sm text-app-text" source={renderFormattedTemplate(body, samples)} />
          </div>

          <div className="rounded-app border border-app-border p-4">
            <p className="text-sm font-semibold text-app-text">Send a test</p>
            <p className="mt-1 text-xs text-app-muted">
              {isEmail
                ? "Sends the saved message with example values to your own email address."
                : "Sends the saved message with example values. Leave the number blank to use your own."}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {isEmail ? null : (
                <Input
                  aria-label="Test phone number"
                  className="max-w-xs"
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  value={testNumber}
                />
              )}
              <Button disabled={test.isPending} onClick={sendTest} type="button" variant="outline">
                <Send className="size-4" strokeWidth={2.5} />
                {test.isPending ? "Sending…" : "Send test"}
              </Button>
            </div>
            {testResult ? <p className="mt-2 text-xs text-app-muted">{testResult}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={restoreDefault} type="button" variant="outline">
            <RotateCcw className="size-4" strokeWidth={2.5} />
            Use default wording
          </Button>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={update.isPending || incomplete} onClick={save} type="button">
            {update.isPending ? "Saving…" : "Save message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
