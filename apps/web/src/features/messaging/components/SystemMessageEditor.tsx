"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import {
  SYSTEM_MESSAGE_CHANNEL_LABELS,
  SYSTEM_MESSAGE_CHANNELS,
  SYSTEM_MESSAGE_DEFINITIONS,
  composeWhatsAppText,
  findMissingRequiredVariables,
  findUnknownSystemMessageVariables,
  renderFormattedTemplate,
  renderMessageTemplate,
  sampleVariables,
  type SystemMessageChannel,
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
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextEditor } from "@/components/ui/TextEditor";
import { useTestSystemMessage, useUpdateSystemMessage } from "../hooks/useMessagingApi";
import { PlaceholderPicker, useTemplateInsert } from "./PlaceholderPicker";

type Props = {
  emailConfigured: boolean;
  message: SystemMessageItem;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  whatsappConfigured: boolean;
};

const CHANNEL_SWITCH_LABELS: Record<SystemMessageChannel, string> = {
  EMAIL: "Email",
  IN_APP: "In-app notification",
  WHATSAPP: "WhatsApp"
};

export function SystemMessageEditor({ emailConfigured, message, onOpenChange, open, whatsappConfigured }: Props) {
  const definition = SYSTEM_MESSAGE_DEFINITIONS[message.key];
  const supportsWhatsApp = definition.channels.includes("WHATSAPP");
  const update = useUpdateSystemMessage();
  const test = useTestSystemMessage();

  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [whatsappBody, setWhatsappBody] = useState(message.whatsappBody ?? "");
  const [actionLabel, setActionLabel] = useState(message.actionLabel ?? "");
  const [channels, setChannels] = useState<SystemMessageChannel[]>(message.channels);
  const [testChannel, setTestChannel] = useState<SystemMessageChannel>(definition.channels[0]);
  const [testNumber, setTestNumber] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubject(message.subject);
      setBody(message.body);
      setWhatsappBody(message.whatsappBody ?? "");
      setActionLabel(message.actionLabel ?? "");
      setChannels(message.channels);
      setTestChannel(definition.channels[0]);
      setTestResult(null);
    }
  }, [definition.channels, message, open]);

  const { bodyProps, focusBodyEnd, headingProps, insert } = useTemplateInsert({
    body: { onChange: setBody, value: body },
    heading: { onChange: setSubject, value: subject }
  });

  const samples = useMemo(() => sampleVariables(definition.variables), [definition.variables]);
  const unknown = findUnknownSystemMessageVariables(message.key, `${subject} ${body} ${whatsappBody}`);
  const missing = findMissingRequiredVariables(message.key, body);
  const incomplete =
    !body.trim() ||
    !subject.trim() ||
    channels.length === 0 ||
    missing.length > 0 ||
    (Boolean(definition.actionVariable) && !actionLabel.trim());

  // What WhatsApp would send: this academy's wording, else the standard one, with the link added.
  const whatsappPreview = useMemo(() => {
    const wording = whatsappBody.trim() || definition.defaults.whatsappBody || body;
    const url = definition.actionVariable ? samples[definition.actionVariable] : "";
    const label = actionLabel.trim() || definition.defaults.actionLabel;
    return composeWhatsAppText(renderFormattedTemplate(wording, samples), url && label ? { label, url } : null);
  }, [actionLabel, body, definition, samples, whatsappBody]);

  const toggle = (channel: SystemMessageChannel, on: boolean) =>
    setChannels((current) =>
      SYSTEM_MESSAGE_CHANNELS.filter((c) => (c === channel ? on : current.includes(c)))
    );

  const restoreDefault = () => {
    setSubject(definition.defaults.subject);
    setBody(definition.defaults.body);
    setWhatsappBody("");
    setActionLabel(definition.defaults.actionLabel ?? "");
    setChannels([...definition.defaultChannels]);
  };

  const save = () => {
    update.mutate(
      {
        data: {
          actionLabel: definition.actionVariable ? actionLabel : null,
          body,
          channels,
          subject,
          whatsappBody: supportsWhatsApp && whatsappBody.trim() ? whatsappBody : null
        },
        key: message.key
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const sendTest = () => {
    test.mutate(
      {
        data: {
          channel: testChannel,
          ...(testChannel === "WHATSAPP" && testNumber.trim() ? { phoneNumber: testNumber.trim() } : {})
        },
        key: message.key
      },
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
          <div className="grid gap-3 rounded-app border border-app-border bg-app-background p-4">
            <p className="text-sm font-semibold text-app-text">Send by</p>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {SYSTEM_MESSAGE_CHANNELS.map((channel) => (
                <Switch
                  checked={channels.includes(channel)}
                  disabled={!definition.channels.includes(channel)}
                  id={`${message.key}-${channel}`}
                  key={channel}
                  label={CHANNEL_SWITCH_LABELS[channel]}
                  onCheckedChange={(checked) => toggle(channel, checked === true)}
                />
              ))}
            </div>
            {definition.channelNote ? <p className="text-xs text-app-muted">{definition.channelNote}</p> : null}
            {channels.length === 0 ? (
              <p className="text-xs text-app-danger-ink">Keep at least one channel on, or nobody receives this message.</p>
            ) : null}
            {channels.includes("EMAIL") && !emailConfigured ? (
              <p className="text-xs text-app-danger-ink">
                Email is not configured on this server, so nothing will be sent on that channel.
              </p>
            ) : null}
            {channels.includes("WHATSAPP") && !whatsappConfigured ? (
              <p className="text-xs text-app-danger-ink">
                WhatsApp is not configured on this server, so nothing will be sent on that channel.
              </p>
            ) : null}
            {channels.includes("WHATSAPP") ? (
              <p className="text-xs text-app-muted">
                WhatsApp texts someone who hasn&apos;t messaged the academy in the last 24 hours may not arrive
                without an approved template.
              </p>
            ) : null}
          </div>

          <FormField
            hint="The email subject, and the title of the in-app notification."
            id={`${message.key}-subject`}
            label="Subject"
          >
            <Input
              {...headingProps}
              id={`${message.key}-subject`}
              onChange={(e) => setSubject(e.target.value)}
              value={subject}
            />
          </FormField>

          <FormField
            hint="Used for email and in-app, and for WhatsApp unless you write a WhatsApp version below."
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
              hint="The button and its link are added automatically: below the email, as a line under the WhatsApp text, and as the in-app notification's link."
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

          {supportsWhatsApp ? (
            <FormField
              hint="Optional. A shorter text for WhatsApp, which shows bold and italic and writes a link out as its address. Leave it empty for the standard WhatsApp text."
              id={`${message.key}-whatsapp`}
              label="WhatsApp version"
            >
              <TextEditor
                id={`${message.key}-whatsapp`}
                linkTargets="template"
                onChange={setWhatsappBody}
                placeholder={definition.defaults.whatsappBody ?? "Same as the message above"}
                rows={3}
                value={whatsappBody}
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
            <p className="mt-2 break-words text-sm font-semibold text-app-text">
              {renderMessageTemplate(subject, samples)}
            </p>
            <FormattedText className="mt-2 text-sm text-app-text" source={renderFormattedTemplate(body, samples)} />
            {supportsWhatsApp ? (
              <>
                <p className="mt-4 text-xs font-semibold text-app-muted">WhatsApp</p>
                <FormattedText className="mt-1 text-sm text-app-text" source={whatsappPreview} />
              </>
            ) : null}
          </div>

          <div className="rounded-app border border-app-border p-4">
            <p className="text-sm font-semibold text-app-text">Send a test</p>
            <p className="mt-1 text-xs text-app-muted">
              Sends the saved message with example values: an email to your own address, an in-app notification to
              your own inbox, or a WhatsApp text to the number you type (blank uses your own).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Select
                aria-label="Test channel"
                className="w-40"
                onChange={(e) => setTestChannel(e.target.value as SystemMessageChannel)}
                options={definition.channels.map((channel) => ({
                  label: SYSTEM_MESSAGE_CHANNEL_LABELS[channel],
                  value: channel
                }))}
                value={testChannel}
              />
              {testChannel === "WHATSAPP" ? (
                <Input
                  aria-label="Test phone number"
                  className="max-w-xs"
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  value={testNumber}
                />
              ) : null}
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
            Use defaults
          </Button>
          <Button onClick={() => onOpenChange(false)} type="button" variant="neutral">
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
