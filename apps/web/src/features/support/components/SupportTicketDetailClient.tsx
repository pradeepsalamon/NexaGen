"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Bot, Download, Hand, MessageSquareText, Paperclip, Send, Trash2 } from "lucide-react";
import {
  API_ROUTES,
  SUPPORT_REPLY_MAX,
  type SupportMessageItem,
  type SupportTicketDetail,
  type SupportTicketEventItem,
  type SupportTicketStatus
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoading } from "@/components/layout/PageLoading";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { LinkedText } from "@/components/ui/FormattedText";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { chatDayLabel } from "@/features/chat/lib/chatFormat";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { apiUrl } from "@/lib/apiBase";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { useRouter } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { exportSupportContact } from "../api/supportAdminApi";
import {
  useAddSupportNote,
  useEraseSupportContact,
  useUnlinkSupportContact,
  useReplyToSupportTicket,
  useReturnSupportTicketToBot,
  useSupportAgentsQuery,
  useSupportMessagesQuery,
  useSupportSavedRepliesQuery,
  useSupportTicketQuery,
  useTakeOverSupportTicket,
  useUpdateSupportTicket
} from "../hooks/useSupportAdmin";
import {
  CONVERSATION_STATUS_BADGE,
  formatWaNumber,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_CONVERSATION_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  TICKET_STATUS_BADGE,
  TICKET_STATUS_OPTIONS
} from "../lib/supportLabels";

const MESSAGE_STATUS_TEXT: Record<SupportMessageItem["status"], string> = {
  DELIVERED: "Delivered",
  FAILED: "Not delivered",
  PENDING: "Sending…",
  READ: "Read",
  RECEIVED: "",
  SENT: "Sent"
};

const EVENT_TITLES: Record<SupportTicketEventItem["kind"], string> = {
  ASSIGNED: "Assignment",
  CREATED: "Opened",
  HANDOFF: "Asked for a person",
  NOTE: "Note",
  RETURNED_TO_BOT: "Back to the bot",
  STATUS_CHANGED: "Status",
  TAKEN_OVER: "Taken over"
};

/** `/admin/support/tickets/[id]`: one WhatsApp support request. */
export function SupportTicketDetailClient({ ticketId }: { ticketId: string }) {
  const ticket = useSupportTicketQuery(ticketId);

  if (ticket.isLoading) return <PageLoading />;
  if (ticket.isError || !ticket.data) {
    return (
      <div className="pb-10">
        <PageHeader breadcrumbs={[{ href: "/admin/support", label: "WhatsApp support" }, { label: "Ticket" }]} title="Ticket" />
        <WidgetError message="This ticket could not be loaded." onRetry={() => void ticket.refetch()} />
      </div>
    );
  }
  return <TicketView ticket={ticket.data} />;
}

function TicketView({ ticket }: { ticket: SupportTicketDetail }) {
  const takeOver = useTakeOverSupportTicket(ticket.id);
  const returnToBot = useReturnSupportTicketToBot(ticket.id);
  const update = useUpdateSupportTicket(ticket.id);
  const resolved = ticket.status === "RESOLVED";
  const staffAnswering = ticket.conversationStatus === "AGENT";

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {staffAnswering ? (
              <Button isLoading={returnToBot.isPending} onClick={() => returnToBot.mutate(undefined)} variant="neutral">
                <Bot className="mr-1.5 size-4" strokeWidth={2.25} />
                Return to bot
              </Button>
            ) : ticket.conversationStatus !== "CLOSED" ? (
              <Button isLoading={takeOver.isPending} onClick={() => takeOver.mutate(undefined)} variant="outline">
                <Hand className="mr-1.5 size-4" strokeWidth={2.25} />
                Take over
              </Button>
            ) : null}
            <Button
              isLoading={update.isPending}
              onClick={() => update.mutate({ status: resolved ? "OPEN" : "RESOLVED" })}
              variant={resolved ? "neutral" : "primary"}
            >
              {resolved ? "Reopen" : "Mark resolved"}
            </Button>
          </div>
        }
        breadcrumbs={[{ href: "/admin/support", label: "WhatsApp support" }, { label: ticket.reference }]}
        description={`${SUPPORT_CATEGORY_LABELS[ticket.category]} · from ${ticket.contact.profileName ?? "WhatsApp user"} (${formatWaNumber(ticket.contact.waId)})`}
        title={ticket.reference}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Conversation ticket={ticket} />
        <div className="grid content-start gap-5">
          <TicketFacts ticket={ticket} />
          <TicketHistory ticket={ticket} />
          <ContactData ticket={ticket} />
        </div>
      </div>
    </div>
  );
}

function Conversation({ ticket }: { ticket: SupportTicketDetail }) {
  const timeZone = useUserTimeZone();
  const messagesQuery = useSupportMessagesQuery(ticket.id);
  const reply = useReplyToSupportTicket(ticket.id);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Pages arrive newest first; the thread reads oldest at the top.
  const messages = useMemo(
    () => [...(messagesQuery.data?.pages.flatMap((page) => page.items) ?? [])].reverse(),
    [messagesQuery.data]
  );
  const newestId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [newestId]);

  const windowOpen = ticket.contact.replyWindowEndsAt !== null;
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    stickToBottom.current = true;
    try {
      await reply.mutateAsync({ body });
      setDraft("");
    } catch {
      // The hook's toast says why; the draft stays for another try.
    }
  };

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
        <h2 className="text-base font-bold text-app-text">Conversation</h2>
        <Badge variant={CONVERSATION_STATUS_BADGE[ticket.conversationStatus]}>
          {SUPPORT_CONVERSATION_STATUS_LABELS[ticket.conversationStatus]}
        </Badge>
      </div>

      <div
        aria-label="WhatsApp conversation"
        aria-live="polite"
        className="h-[min(60vh,36rem)] space-y-1 overflow-y-auto bg-app-background/40 px-3 py-4 sm:px-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        ref={scrollRef}
        role="log"
        tabIndex={0}
      >
        {messagesQuery.hasNextPage ? (
          <div className="flex justify-center pb-2">
            <Button
              disabled={messagesQuery.isFetchingNextPage}
              onClick={() => {
                stickToBottom.current = false;
                void messagesQuery.fetchNextPage();
              }}
              size="sm"
              variant="outline"
            >
              {messagesQuery.isFetchingNextPage ? <Spinner className="mr-1.5 size-4" /> : null}
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {messagesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton className={cn("h-10 w-2/3 rounded-app", i % 2 ? "ml-auto" : null)} key={i} />
            ))}
          </div>
        ) : null}
        {messagesQuery.isError ? <WidgetError message="Messages could not be loaded." onRetry={() => void messagesQuery.refetch()} /> : null}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const day = chatDayLabel(message.createdAt, timeZone);
          const showDay = !previous || chatDayLabel(previous.createdAt, timeZone) !== day;
          const showName = !previous || previous.author !== message.author || previous.sentBy?.id !== message.sentBy?.id || showDay;
          return (
            <Fragment key={message.id}>
              {showDay ? (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-app-soft px-3 py-0.5 text-xs font-semibold text-app-muted">{day}</span>
                </div>
              ) : null}
              <MessageBubble message={message} showName={showName} time={formatTime(message.createdAt, timeZone)} />
            </Fragment>
          );
        })}
      </div>

      <form noValidate className="grid gap-2 border-t border-app-border p-3" onSubmit={(event) => void submit(event)}>
        {!windowOpen ? (
          <Alert variant="warning">
            The customer last wrote more than 24 hours ago. WhatsApp only allows an approved template now, so your reply
            goes inside the academy&apos;s reply template (or is refused if none is set up).
          </Alert>
        ) : null}
        <div className="flex items-end gap-2">
          <SavedReplyPicker
            onPick={(body) => setDraft((current) => (current.trim() ? `${current.trimEnd()}\n\n${body}` : body))}
          />
          <Textarea
            aria-label="Reply on WhatsApp"
            className="max-h-40 min-h-[44px] flex-1 resize-none"
            maxLength={SUPPORT_REPLY_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Reply on WhatsApp…"
            rows={1}
            value={draft}
          />
          <Button aria-label="Send reply" disabled={!draft.trim()} isLoading={reply.isPending} size="icon" type="submit">
            <Send className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
        <p className="text-xs text-app-muted">
          Sending a reply takes the conversation over from the bot. Use the speech-bubble button for a saved answer. Never ask for
          card numbers, OTPs or passwords.
        </p>
      </form>
    </Card>
  );
}

/** Inserts one of the academy's saved answers into the reply box, to edit before sending. */
function SavedReplyPicker({ onPick }: { onPick: (body: string) => void }) {
  const answers = useSupportSavedRepliesQuery();
  const items = answers.data ?? [];
  return (
    <DropdownMenu>
      <SimpleTooltip label="Insert a saved answer">
        <DropdownMenuTrigger asChild>
          <Button aria-label="Insert a saved answer" size="icon" type="button" variant="neutral">
            <MessageSquareText className="size-4" strokeWidth={2.5} />
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>Saved answers</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {answers.isLoading ? <DropdownMenuItem disabled>Loading…</DropdownMenuItem> : null}
        {!answers.isLoading && items.length === 0 ? <DropdownMenuItem disabled>None yet</DropdownMenuItem> : null}
        {items.map((item) => (
          <DropdownMenuItem className="grid gap-0.5" key={item.id} onSelect={() => onPick(item.body)}>
            <span className="font-semibold">{item.title}</span>
            <span className="line-clamp-2 text-xs text-app-muted">{item.body}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/support/saved-replies">Manage saved answers</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MessageBubble({ message, showName, time }: { message: SupportMessageItem; showName: boolean; time: string }) {
  const ours = message.direction === "OUTBOUND";
  const name = message.author === "CUSTOMER" ? "Customer" : message.author === "BOT" ? "Bot" : (message.sentBy?.name ?? "Staff");
  const status = ours ? MESSAGE_STATUS_TEXT[message.status] : "";
  return (
    <div className={cn("flex flex-col", ours ? "items-end" : "items-start", showName ? "pt-2" : null)}>
      {showName ? <span className="mb-0.5 px-1 text-xs font-semibold text-app-muted">{name}</span> : null}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-app px-3 py-2 text-sm sm:max-w-[70%]",
          message.author === "AGENT"
            ? "bg-primary text-on-primary"
            : message.author === "BOT"
              ? "bg-app-soft text-app-text"
              : "border border-app-border bg-app-surface text-app-text"
        )}
      >
        <LinkedText onColour={message.author === "AGENT"} text={message.body} />
        {message.attachment ? <AttachmentLink attachment={message.attachment} /> : null}
      </div>
      <span className={cn("mt-0.5 px-1 text-xs", message.status === "FAILED" ? "text-app-danger-ink" : "text-app-muted")}>
        {[time, status].filter(Boolean).join(" · ")}
        {message.status === "FAILED" && message.error ? `: ${message.error}` : ""}
      </span>
    </div>
  );
}

/** An image or PDF the customer sent, opened through the API (admins only; never a storage URL). */
function AttachmentLink({ attachment }: { attachment: NonNullable<SupportMessageItem["attachment"]> }) {
  const label = attachment.kind === "pdf" ? "Download PDF" : "Open image";
  if (attachment.status === "STORED") {
    return (
      <a
        className="mt-1.5 flex items-center gap-1.5 font-semibold text-primary-ink underline-offset-2 hover:underline"
        href={apiUrl(API_ROUTES.adminSupport.attachment(attachment.id))}
        rel="noopener"
        target="_blank"
      >
        <Paperclip className="size-4" strokeWidth={2.25} />
        {attachment.filename ?? label}
      </a>
    );
  }
  return (
    <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs", attachment.status === "FAILED" ? "text-app-danger-ink" : "text-app-muted")}>
      <Paperclip className="size-3.5" strokeWidth={2.25} />
      {attachment.status === "PENDING" ? "Saving the file…" : `File not kept: ${attachment.error ?? "unknown reason"}`}
    </p>
  );
}

function TicketFacts({ ticket }: { ticket: SupportTicketDetail }) {
  const timeZone = useUserTimeZone();
  const agents = useSupportAgentsQuery();
  const update = useUpdateSupportTicket(ticket.id);
  const windowEnds = ticket.contact.replyWindowEndsAt;

  return (
    <Card className="grid gap-4 p-4">
      <h2 className="text-base font-bold text-app-text">Request</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <label className="grid gap-1.5 text-sm font-semibold text-app-text">
          Status
          <Select
            disabled={update.isPending}
            onChange={(event) => update.mutate({ status: event.target.value as SupportTicketStatus })}
            options={TICKET_STATUS_OPTIONS}
            value={ticket.status}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-app-text">
          Assigned to
          <Select
            disabled={update.isPending || agents.isLoading}
            onChange={(event) => update.mutate({ assignedToId: event.target.value || null })}
            options={[
              { label: "Unassigned", value: "" },
              ...(agents.data ?? []).map((agent) => ({ label: agent.name, value: agent.id })),
              // Keep a former admin visible until someone reassigns the ticket.
              ...(ticket.assignedTo && !(agents.data ?? []).some((agent) => agent.id === ticket.assignedTo?.id)
                ? [{ label: ticket.assignedTo.name, value: ticket.assignedTo.id }]
                : [])
            ]}
            value={ticket.assignedTo?.id ?? ""}
          />
        </label>
      </div>

      <dl className="grid gap-3 text-sm">
        <Fact label="Ticket status">
          <Badge variant={TICKET_STATUS_BADGE[ticket.status]}>{SUPPORT_TICKET_STATUS_LABELS[ticket.status]}</Badge>
        </Fact>
        <Fact label="WhatsApp">
          {ticket.contact.profileName ?? "WhatsApp user"} · {formatWaNumber(ticket.contact.waId)}
        </Fact>
        <Fact label="Student (as typed)">{ticket.studentName ?? "-"}</Fact>
        {ticket.lead ? (
          <Fact label="Lead">
            <Link className="font-semibold text-primary-ink hover:underline" href={`/admin/leads?lead=${ticket.lead.id}`}>
              {ticket.lead.studentName}
            </Link>{" "}
            · {ticket.lead.status.replace(/_/g, " ").toLowerCase()}
          </Fact>
        ) : null}
        <Fact label="Reply window">
          {windowEnds ? `Open until ${formatDateTime(windowEnds, timeZone)}` : "Closed (template only)"}
        </Fact>
        {ticket.contact.optedOut ? (
          <Fact label="Reminders">Replied STOP: no automatic WhatsApp messages</Fact>
        ) : null}
        <Fact label="Opened">{formatDateTime(ticket.createdAt, timeZone)}</Fact>
        {ticket.resolvedAt ? <Fact label="Resolved">{formatDateTime(ticket.resolvedAt, timeZone)}</Fact> : null}
      </dl>

      <div className="grid gap-1.5">
        <h3 className="text-sm font-semibold text-app-text">What they wrote</h3>
        <p className="whitespace-pre-wrap break-words rounded-control bg-app-soft px-3 py-2 text-sm text-app-text">
          {ticket.details ? <LinkedText text={ticket.details} /> : ticket.handoff ? "Asked to talk to the team." : "-"}
        </p>
        <p className="text-xs text-app-muted">
          The bot doesn&apos;t check who the sender is: confirm the student before you share or change anything.
        </p>
      </div>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-app-muted">{label}</dt>
      <dd className="break-words text-app-text">{children}</dd>
    </div>
  );
}

/** A parent's access or erasure request (docs/WHATSAPP_SUPPORT.md §0): the number isn't an account. */
function ContactData({ ticket }: { ticket: SupportTicketDetail }) {
  const router = useRouter();
  const toast = useToast();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");
  const erase = useEraseSupportContact();
  const unlink = useUnlinkSupportContact(ticket.id);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const data = await exportSupportContact(ticket.contact.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `whatsapp-${ticket.contact.waId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      toast.error({ message: cause instanceof Error ? cause.message : undefined, title: "Couldn't download the data" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="grid gap-3 p-4">
      <h2 className="text-base font-bold text-app-text">Contact&apos;s data</h2>
      <p className="text-sm text-app-muted">
        For a parent who asks what you hold about them, or asks you to delete it. This WhatsApp number isn&apos;t an account, so it
        isn&apos;t in the account privacy tools.
      </p>
      {ticket.contact.linkedStudents.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-app-text">Linked students</h3>
          <p className="text-xs text-app-muted">This number may ask the assistant for these students&apos; next class.</p>
          <ul className="grid gap-1.5">
            {ticket.contact.linkedStudents.map((student) => (
              <li className="flex items-center justify-between gap-2 text-sm" key={student.id}>
                <Link className="truncate text-primary-ink hover:underline" href={`/admin/students/${student.id}`}>
                  {student.name}
                </Link>
                <Button
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate({ contactId: ticket.contact.id, studentId: student.id })}
                  size="sm"
                  type="button"
                  variant="neutral"
                >
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button isLoading={downloading} onClick={() => void download()} variant="outline">
          <Download className="mr-1.5 size-4" strokeWidth={2.25} />
          Download data
        </Button>
        {isSuperAdmin ? (
          <Button onClick={() => setConfirming(true)} variant="danger-soft">
            <Trash2 className="mr-1.5 size-4" strokeWidth={2.25} />
            Erase contact
          </Button>
        ) : null}
      </div>
      <ConfirmationModal
        confirmLabel="Erase"
        icon={Trash2}
        isConfirming={erase.isPending}
        isOpen={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          erase.mutateAsync(ticket.contact.id).then(() => router.push("/admin/support"), () => setConfirming(false));
        }}
        title="Erase this WhatsApp contact?"
      >
        Every conversation, message and request from {formatWaNumber(ticket.contact.waId)} is deleted for good, including this
        one. A lead made from it stays in Leads. If the number replied STOP, only the number is kept, so it gets no automatic
        messages.
      </ConfirmationModal>
    </Card>
  );
}

function TicketHistory({ ticket }: { ticket: SupportTicketDetail }) {
  const timeZone = useUserTimeZone();
  const addNote = useAddSupportNote(ticket.id);
  const [note, setNote] = useState("");

  return (
    <Card className="grid gap-4 p-4">
      <h2 className="text-base font-bold text-app-text">Notes and history</h2>
      <ol className="grid gap-3">
        {ticket.events.map((event) => (
          <li className="grid gap-0.5 border-l-2 border-app-border pl-3" key={event.id}>
            <p className="text-xs text-app-muted">
              {EVENT_TITLES[event.kind]} · {event.actor?.name ?? "Bot"} · {formatDateTime(event.createdAt, timeZone)}
            </p>
            {event.body ? (
              <p className="whitespace-pre-wrap break-words text-sm text-app-text">
                <LinkedText text={event.body} />
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <form noValidate
        className="grid gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = note.trim();
          if (!body) return;
          try {
            await addNote.mutateAsync({ body });
            setNote("");
          } catch {
            // Toast already shown; keep the text.
          }
        }}
      >
        <Textarea
          aria-label="Internal note"
          maxLength={SUPPORT_REPLY_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Internal note (the customer never sees it)…"
          rows={3}
          value={note}
        />
        <div className="flex justify-end">
          <Button disabled={!note.trim()} isLoading={addNote.isPending} type="submit" variant="neutral">
            Add note
          </Button>
        </div>
      </form>
    </Card>
  );
}
