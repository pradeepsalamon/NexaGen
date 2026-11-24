"use client";

import { onInvalidSubmit } from "@/lib/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { MessageSquareText, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  SUPPORT_BOT_ANSWERS_MAX,
  SUPPORT_SAVED_REPLY_LIMITS,
  supportSavedReplyRequestSchema,
  type SupportSavedReplyItem,
  type SupportUnansweredQuestionItem
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoading } from "@/components/layout/PageLoading";
import { Alert } from "@/components/ui/Alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Switch } from "@/components/ui/Switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  useDeleteSupportSavedReply,
  useDismissSupportUnanswered,
  useSaveSupportSavedReply,
  useSupportSavedRepliesQuery,
  useSupportUnansweredQuery
} from "../hooks/useSupportAdmin";

type View = "answers" | "unanswered";

/** The dialog edits keywords as one comma-separated line. */
const formSchema = supportSavedReplyRequestSchema.omit({ keywords: true }).extend({
  description: z.string().trim().max(SUPPORT_SAVED_REPLY_LIMITS.description, `At most ${SUPPORT_SAVED_REPLY_LIMITS.description} characters`),
  keywordsText: z.string().max(SUPPORT_SAVED_REPLY_LIMITS.keywords * (SUPPORT_SAVED_REPLY_LIMITS.keyword + 2)),
  showInBot: z.boolean(),
  sortOrder: z.coerce.number().int().min(0, "0 or more").max(999)
});
type FormValues = z.input<typeof formSchema>;

const splitKeywords = (text: string) =>
  text
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);

/** `/admin/support/saved-replies`: answers the WhatsApp bot sends and staff insert into replies. */
export function SupportSavedRepliesClient() {
  const answers = useSupportSavedRepliesQuery();
  const [view, setView] = useState<View>("answers");
  const [editing, setEditing] = useState<SupportSavedReplyItem | "new" | null>(null);
  // "Write an answer" from the unanswered list: the question it answers, dismissed once saved.
  const [forQuestion, setForQuestion] = useState<SupportUnansweredQuestionItem | null>(null);
  // Only the count for the tab label; the tab itself pages through them.
  const unansweredTotal = useSupportUnansweredQuery({ pageSize: 1 }).data?.pagination.total;
  const answerQuestion = useCallback((question: SupportUnansweredQuestionItem) => {
    setForQuestion(question);
    setEditing("new");
  }, []);
  const [deleting, setDeleting] = useState<SupportSavedReplyItem | null>(null);
  const remove = useDeleteSupportSavedReply();

  if (answers.isLoading) return <PageLoading />;
  const items = answers.data ?? [];
  const full = items.length >= SUPPORT_SAVED_REPLY_LIMITS.total;
  const nextOrder = items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;

  return (
    <div className="animate-fade-in pb-10">
      <Tabs onValueChange={(value) => setView(value as View)} value={view}>
        <PageHeader
          actions={
            <Button disabled={full} onClick={() => setEditing("new")}>
              <Plus className="mr-1.5 size-4" strokeWidth={2.5} />
              New answer
            </Button>
          }
          breadcrumbs={[{ href: "/admin/support", label: "WhatsApp support" }, { label: "Saved answers" }]}
          description={`Write each answer once. The WhatsApp assistant sends it the moment a parent taps it or types one of its keywords (a small spelling slip gets "Did you mean …?"; the first ${SUPPORT_BOT_ANSWERS_MAX} appear in its "Courses & free demo" list), and staff can insert any of them into a reply.`}
          tabs={
            <TabsList>
              <TabsTrigger value="answers">Answers ({items.length})</TabsTrigger>
              <TabsTrigger value="unanswered">
                Unanswered questions{unansweredTotal !== undefined ? ` (${unansweredTotal})` : ""}
              </TabsTrigger>
            </TabsList>
          }
          title="Saved answers"
        />
      </Tabs>

      {view === "unanswered" ? (
        <UnansweredQuestions onAnswer={answerQuestion} />
      ) : null}

      {view === "answers" && answers.isError ? <WidgetError message="Saved answers could not be loaded." onRetry={() => void answers.refetch()} /> : null}

      {view === "answers" && !answers.isError && items.length === 0 ? (
        <EmptyState
          action={{ label: "Write the first answer", onClick: () => setEditing("new") }}
          description="Start with what parents ask most: fees, batch timings, class length, levels."
          icon={MessageSquareText}
          title="No saved answers yet"
        />
      ) : null}

      {view === "answers" && items.length > 0 ? (
        <div className="grid gap-3">
          {full ? (
            <Alert variant="warning">An academy can keep up to {SUPPORT_SAVED_REPLY_LIMITS.total} saved answers. Delete one to add another.</Alert>
          ) : null}
          {items.map((item) => (
            <Card className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4" key={item.id}>
              <div className="grid min-w-0 gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-app-text">{item.title}</h2>
                  {item.inBotMenu ? (
                    <Badge variant="success">In the bot&apos;s list</Badge>
                  ) : item.showInBot ? (
                    <Badge variant="info">Bot: keywords only</Badge>
                  ) : (
                    <Badge variant="secondary">Staff only</Badge>
                  )}
                </div>
                {item.description ? <p className="text-sm text-app-muted">{item.description}</p> : null}
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-app-text">{item.body}</p>
                {item.keywords.length > 0 ? (
                  <p className="text-xs text-app-muted">Keywords: {item.keywords.join(", ")}</p>
                ) : item.showInBot ? (
                  <p className="text-xs text-app-muted">No keywords: the bot sends it only when tapped in its list.</p>
                ) : null}
              </div>
              <RowActions
                actions={[
                  { ariaLabel: `Edit ${item.title}`, icon: Pencil, label: "Edit", onSelect: () => setEditing(item) },
                  { ariaLabel: `Delete ${item.title}`, icon: Trash2, label: "Delete", onSelect: () => setDeleting(item), tone: "danger" }
                ]}
              />
            </Card>
          ))}
        </div>
      ) : null}

      {editing ? (
        <SavedReplyDialog
          item={editing === "new" ? null : editing}
          nextOrder={nextOrder}
          onClose={() => {
            setEditing(null);
            setForQuestion(null);
          }}
          question={forQuestion}
        />
      ) : null}

      <AlertDialog onOpenChange={(open) => !open && setDeleting(null)} open={deleting !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The bot stops sending it straight away. Messages already sent stay in the conversations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** What parents asked that no saved answer matched, most asked first. */
function UnansweredQuestions({ onAnswer }: { onAnswer: (question: SupportUnansweredQuestionItem) => void }) {
  const serverTable = useServerTable({ pageSize: 20 });
  const { clampToPageCount } = serverTable;
  const { data, isError, isLoading, refetch } = useSupportUnansweredQuery({
    page: serverTable.params.page,
    pageSize: serverTable.params.pageSize,
    search: serverTable.params.search
  });
  const { isPending: dismissing, mutate: dismissQuestion } = useDismissSupportUnanswered();
  const timeZone = useUserTimeZone();
  const rows = useMemo(() => data?.items ?? [], [data?.items]);
  const pageCount = data?.pagination.totalPages ?? 1;
  useEffect(() => {
    clampToPageCount(pageCount);
  }, [pageCount, clampToPageCount]);

  const columns = useMemo<ColumnDef<SupportUnansweredQuestionItem>[]>(
    () => [
      {
        cell: ({ row }) => <p className="min-w-48 max-w-xl whitespace-pre-wrap break-words text-sm text-app-text">{row.original.text}</p>,
        header: "Question",
        id: "text",
        meta: { label: "Question" }
      },
      {
        cell: ({ row }) => <span className="text-sm font-semibold text-app-text">{row.original.timesAsked}</span>,
        header: "Times asked",
        id: "timesAsked",
        meta: { label: "Times asked" }
      },
      {
        cell: ({ row }) => <span className="whitespace-nowrap text-sm text-app-muted">{formatDateTime(row.original.lastAskedAt, timeZone)}</span>,
        header: "Last asked",
        id: "lastAskedAt",
        meta: { label: "Last asked" }
      },
      {
        cell: ({ row }) => (
          <RowActions
            actions={[
              { ariaLabel: `Write an answer for "${row.original.text}"`, icon: Plus, label: "Write an answer", onSelect: () => onAnswer(row.original) },
              {
                ariaLabel: `Dismiss "${row.original.text}"`,
                disabled: dismissing,
                icon: X,
                label: "Dismiss",
                onSelect: () => dismissQuestion({ id: row.original.id })
              }
            ]}
          />
        ),
        header: "",
        id: "actions"
      }
    ],
    [dismissQuestion, dismissing, onAnswer, timeZone]
  );

  const { table } = useDataTable<SupportUnansweredQuestionItem, unknown>({
    columns,
    data: rows,
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  if (isError) return <WidgetError message="These questions could not be loaded." onRetry={() => void refetch()} />;
  return (
    <Card className="grid gap-4 p-4">
      <p className="text-sm text-app-muted">
        What parents asked on WhatsApp that no saved answer matched, or where they said the bot&apos;s guess was wrong. Write an
        answer (or add their words as keywords to an existing one), or dismiss it. A dismissed question comes back if it is asked
        again. Kept for 90 days.
      </p>
      <DataTableToolbar onSearchChange={serverTable.setSearch} searchPlaceholder="Search questions..." searchValue={serverTable.search} />
      <DataTable
        columnsLength={columns.length}
        isLoading={isLoading}
        noDataText="Nothing here: the bot had an answer for everything it was asked."
        stackOnMobile
        table={table}
      />
      <DataTablePagination table={table} totalRows={data?.pagination.total ?? 0} />
    </Card>
  );
}

function SavedReplyDialog({
  item,
  nextOrder,
  onClose,
  question
}: {
  item: SupportSavedReplyItem | null;
  nextOrder: number;
  onClose: () => void;
  question: SupportUnansweredQuestionItem | null;
}) {
  const save = useSaveSupportSavedReply();
  const dismiss = useDismissSupportUnanswered();
  const form = useForm<FormValues>({
    mode: "onSubmit",
    defaultValues: {
      body: item?.body ?? "",
      description: item?.description ?? "",
      keywordsText: item?.keywords.join(", ") ?? "",
      showInBot: item?.showInBot ?? true,
      sortOrder: item?.sortOrder ?? nextOrder,
      title: item?.title ?? ""
    },
    resolver: zodResolver(formSchema)
  });
  const { errors } = form.formState;
  const keywords = splitKeywords(form.watch("keywordsText") ?? "");
  const keywordError =
    keywords.length > SUPPORT_SAVED_REPLY_LIMITS.keywords
      ? `At most ${SUPPORT_SAVED_REPLY_LIMITS.keywords} keywords`
      : keywords.some((word) => word.length > SUPPORT_SAVED_REPLY_LIMITS.keyword)
        ? `A keyword is at most ${SUPPORT_SAVED_REPLY_LIMITS.keyword} characters`
        : undefined;

  const submit = form.handleSubmit(async (values) => {
    if (keywordError) return;
    await save.mutateAsync({
      body: {
        body: values.body,
        description: values.description || null,
        keywords,
        showInBot: values.showInBot,
        sortOrder: Number(values.sortOrder),
        title: values.title
      },
      id: item?.id
    });
    // The question it was written for is answered now.
    if (question) await dismiss.mutateAsync({ id: question.id, quiet: true }).catch(() => undefined);
    onClose();
  }, onInvalidSubmit);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit answer" : "New answer"}</DialogTitle>
          <DialogDescription>Parents see exactly this text on WhatsApp. Keep it short and correct: the bot quotes it as written.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" id="saved-reply" noValidate onSubmit={(event) => void submit(event).catch(() => undefined)}>
          {question ? (
            <Alert variant="info">
              A parent asked: &ldquo;{question.text}&rdquo;. Add the words they used to Keywords so the bot finds this answer next
              time.
            </Alert>
          ) : null}
          <FormField
            error={errors.title?.message}
            hint={`The option's name in the bot's list (${SUPPORT_SAVED_REPLY_LIMITS.title} characters at most), e.g. "Fees".`}
            id="saved-reply-title"
            label="Title"
            required
          >
            <Input id="saved-reply-title" maxLength={SUPPORT_SAVED_REPLY_LIMITS.title} {...form.register("title")} />
          </FormField>
          <FormField
            error={errors.description?.message}
            hint="A short line under the title in the list (optional)."
            id="saved-reply-description"
            label="Subtitle"
          >
            <Input id="saved-reply-description" maxLength={SUPPORT_SAVED_REPLY_LIMITS.description} {...form.register("description")} />
          </FormField>
          <FormField error={errors.body?.message} id="saved-reply-body" label="Answer" required>
            <Textarea id="saved-reply-body" maxLength={SUPPORT_SAVED_REPLY_LIMITS.body} rows={6} {...form.register("body")} />
          </FormField>
          <FormField
            error={keywordError ?? errors.keywordsText?.message}
            hint='Comma-separated words or phrases parents type, e.g. "fee, price, cost". "fee" also matches "fees".'
            id="saved-reply-keywords"
            label="Keywords"
          >
            <Input id="saved-reply-keywords" {...form.register("keywordsText")} />
          </FormField>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField
              error={errors.sortOrder?.message}
              hint={`Lower comes first. The bot lists the first ${SUPPORT_BOT_ANSWERS_MAX}.`}
              id="saved-reply-order"
              label="Position"
            >
              <Input id="saved-reply-order" inputMode="numeric" min={0} type="number" {...form.register("sortOrder")} />
            </FormField>
            <div className="grid gap-1 pt-6">
              <Controller
                control={form.control}
                name="showInBot"
                render={({ field }) => (
                  <Switch checked={field.value} id="saved-reply-bot" label="The bot may send it" onCheckedChange={field.onChange} />
                )}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button form="saved-reply" isLoading={save.isPending} type="submit">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
