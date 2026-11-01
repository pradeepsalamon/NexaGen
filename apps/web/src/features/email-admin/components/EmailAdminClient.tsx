"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, MailCheck, MailPlus, Send, ShieldCheck } from "lucide-react";
import type {
  DirectEmailDto,
  DirectEmailStatus,
  EmailVerificationPolicy,
  UnverifiedAccountDto
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { DataTableToolbar } from "@/components/ui/DataTableToolbar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormattedText } from "@/components/ui/FormattedText";
import { Label } from "@/components/ui/Label";
import { RowActions } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDataTable } from "@/hooks/useDataTable";
import { useServerTable } from "@/hooks/useServerTable";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { enumLabel } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import {
  useEmailOverview,
  useSendVerificationLink,
  useSentEmails,
  useSetEmailVerificationPolicy,
  useSetEmailVerified,
  useUnverifiedAccounts,
  useVerifyAllAccounts
} from "../hooks/useEmailAdmin";
import { DirectEmailDialog } from "./DirectEmailDialog";

const POLICY_OPTIONS: { label: string; value: EmailVerificationPolicy }[] = [
  { label: "Off", value: "OFF" },
  { label: "Ask, but don't require", value: "OPTIONAL" },
  { label: "Required to sign in", value: "REQUIRED" }
];

const POLICY_HELP: Record<EmailVerificationPolicy, string> = {
  OFF: "No verification emails go out and no one is asked to verify. New sign-ups count as verified.",
  OPTIONAL:
    "New sign-ups, and anyone who changes their address, get a verification link and see a reminder until they use it. Everyone can still sign in.",
  REQUIRED:
    "Students and coaches who haven't verified can't sign in, and get a new link when they try. People already signed in stay signed in until their session ends. Admins are never stopped, so you can't lock yourself out."
};

const STATUS_BADGE: Record<DirectEmailStatus, { label: string; variant: "destructive" | "success" | "warning" }> = {
  FAILED: { label: "Failed", variant: "destructive" },
  PENDING: { label: "Not confirmed", variant: "warning" },
  SENT: { label: "Sent", variant: "success" }
};

const SENT_STATUS_OPTIONS = [
  { label: "All status", value: "ALL" },
  { label: "Sent", value: "SENT" },
  { label: "Failed", value: "FAILED" },
  { label: "Not confirmed", value: "PENDING" }
];

export function EmailAdminClient() {
  const [composing, setComposing] = useState(false);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] animate-fade-in">
      <PageHeader
        actions={
          <Button onClick={() => setComposing(true)} type="button">
            <MailPlus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Write an email
          </Button>
        }
        description="Decide whether people must verify their email address, and write to anyone with an account."
        title="Email"
      />
      <Tabs defaultValue="verification">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="verification">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Verification
          </TabsTrigger>
          <TabsTrigger value="sent">
            <Send aria-hidden="true" className="size-4" />
            Sent emails
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6 outline-none" value="verification">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <PolicyCard />
            <UnverifiedAccountsCard />
          </div>
        </TabsContent>
        <TabsContent className="mt-6 outline-none" value="sent">
          <SentEmailsCard />
        </TabsContent>
      </Tabs>
      {composing && <DirectEmailDialog onClose={() => setComposing(false)} pickRecipients />}
    </div>
  );
}

function PolicyCard() {
  const overview = useEmailOverview();
  const save = useSetEmailVerificationPolicy();
  const toast = useToast();
  const [draft, setDraft] = useState<EmailVerificationPolicy | null>(null);

  if (overview.isLoading) return <Skeleton className="h-48 w-full rounded-app" />;
  if (overview.isError || !overview.data) {
    return <WidgetError message={overview.error?.message} onRetry={() => void overview.refetch()} />;
  }

  const { policy: saved, smtpConfigured, unverifiedCount } = overview.data;
  const policy = draft ?? saved;
  const needsMail = policy !== "OFF" && !smtpConfigured;

  return (
    <Card className="space-y-4 p-4">
      {!smtpConfigured && (
        <Alert variant="warning">
          Email is not set up on this server (SMTP settings), so verification can only stay off and nothing can be sent.
        </Alert>
      )}
      <div className="space-y-1 sm:max-w-sm">
        <Label htmlFor="email-verification-policy">Email verification</Label>
        <Select
          id="email-verification-policy"
          onChange={(event) => setDraft(event.target.value as EmailVerificationPolicy)}
          options={POLICY_OPTIONS}
          value={policy}
        />
      </div>
      <p className="text-sm text-app-muted">{POLICY_HELP[policy]}</p>
      {policy === "REQUIRED" && saved !== "REQUIRED" && unverifiedCount > 0 && (
        <Alert variant="warning">
          {unverifiedCount === 1 ? "1 student or coach hasn't" : `${unverifiedCount} students and coaches haven't`} verified
          yet. Below, you can mark them as verified or send them a link before you turn this on.
        </Alert>
      )}
      <div className="flex justify-end">
        <Button
          disabled={policy === saved || save.isPending || needsMail}
          onClick={() =>
            save.mutate(policy, {
              onError: (error) => toast.error({ message: getErrorMessage(error), title: "Could not save" }),
              onSuccess: () => {
                setDraft(null);
                toast.success({ title: "Email verification updated" });
              }
            })
          }
          type="button"
        >
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function UnverifiedAccountsCard() {
  const serverTable = useServerTable({ pageSize: 10 });
  const { clampToPageCount } = serverTable;
  const query = useUnverifiedAccounts(serverTable.params);
  const pageCount = query.data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);

  const overview = useEmailOverview();
  const smtpMissing = overview.data?.smtpConfigured === false;
  const toast = useToast();
  const setVerified = useSetEmailVerified();
  const sendLink = useSendVerificationLink();
  const verifyAll = useVerifyAllAccounts();
  const [confirmAll, setConfirmAll] = useState(false);
  const total = query.data?.pagination.total ?? 0;

  const columns = useMemo<ColumnDef<UnverifiedAccountDto>[]>(
    () => [
      { accessorKey: "name", enableSorting: false, header: "Name", meta: { label: "Name" } },
      {
        accessorKey: "email",
        cell: ({ row }) => <span className="break-all">{row.original.email}</span>,
        enableSorting: false,
        header: "Email",
        meta: { label: "Email" }
      },
      {
        accessorKey: "role",
        cell: ({ row }) => <Badge variant="outline">{enumLabel(row.original.role)}</Badge>,
        enableSorting: false,
        header: "Role",
        meta: { label: "Role" }
      },
      {
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "ACTIVE" ? "success" : "warning"}>{enumLabel(row.original.status)}</Badge>
        ),
        enableSorting: false,
        header: "Status",
        meta: { label: "Status" }
      },
      {
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                ariaLabel: `Send a verification link to ${row.original.name}`,
                disabled: sendLink.isPending || smtpMissing,
                icon: Send,
                label: "Send verification link",
                onSelect: () =>
                  sendLink.mutate(row.original.id, {
                    onError: (error) => toast.error({ message: getErrorMessage(error), title: "Could not send the link" }),
                    onSuccess: () => toast.success({ title: "Verification link sent" })
                  })
              },
              {
                ariaLabel: `Mark ${row.original.name} as verified`,
                disabled: setVerified.isPending,
                icon: MailCheck,
                label: "Mark as verified",
                onSelect: () => setVerified.run({ userId: row.original.id, verified: true })
              }
            ]}
          />
        ),
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        id: "actions"
      }
    ],
    [sendLink, setVerified, smtpMissing, toast]
  );

  const { table } = useDataTable<UnverifiedAccountDto, unknown>({
    columns,
    data: query.data?.accounts ?? [],
    getRowId: (row) => row.id,
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  return (
    <Card className="grid gap-4 p-4">
      <div>
        <h2 className="text-lg font-extrabold text-app-text">Students and coaches not verified</h2>
        <p className="text-sm text-app-muted">Admins aren&apos;t listed because they&apos;re never asked to verify.</p>
      </div>
      {query.isError ? (
        <WidgetError message={query.error?.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTableToolbar
            actions={
              <Button disabled={total === 0 || verifyAll.isPending} onClick={() => setConfirmAll(true)} type="button" variant="outline">
                Mark all as verified
              </Button>
            }
            onSearchChange={serverTable.setSearch}
            searchPlaceholder="Search people..."
            searchValue={serverTable.search}
          />
          <DataTable
            columnsLength={columns.length}
            isLoading={query.isLoading}
            noDataText="Everyone is verified."
            stackOnMobile
            table={table}
          />
          <DataTablePagination table={table} totalRows={total} />
        </>
      )}
      <ConfirmationModal
        confirmLabel="Mark all as verified"
        icon={MailCheck}
        isConfirming={verifyAll.isPending}
        isOpen={confirmAll}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() =>
          verifyAll.mutate(undefined, {
            onError: (error) => toast.error({ message: getErrorMessage(error), title: "Could not update" }),
            onSettled: () => setConfirmAll(false),
            onSuccess: ({ count }) => toast.success({ title: `${count} marked as verified` })
          })
        }
        title="Mark every unverified student and coach as verified?"
      >
        Use this when you trust the addresses you already hold. Those people won&apos;t be asked to verify, even if an address is wrong.
      </ConfirmationModal>
    </Card>
  );
}

function SentEmailsCard() {
  const tz = useUserTimeZone();
  const serverTable = useServerTable({ pageSize: 10 });
  const { clampToPageCount } = serverTable;
  const query = useSentEmails(serverTable.params);
  const pageCount = query.data?.pagination.totalPages ?? 1;
  useEffect(() => clampToPageCount(pageCount), [pageCount, clampToPageCount]);
  const [viewing, setViewing] = useState<DirectEmailDto | null>(null);

  const columns = useMemo<ColumnDef<DirectEmailDto>[]>(
    () => [
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatDateTime(row.original.sentAt ?? row.original.createdAt, tz),
        enableSorting: false,
        header: "When",
        meta: { label: "When" }
      },
      {
        accessorKey: "recipientName",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-semibold text-app-text">{row.original.recipientName}</p>
            <p className="break-all text-xs text-app-muted">{row.original.toEmail}</p>
          </div>
        ),
        enableSorting: false,
        header: "To",
        meta: { label: "To" }
      },
      { accessorKey: "subject", enableSorting: false, header: "Subject", meta: { label: "Subject" } },
      {
        accessorKey: "senderName",
        cell: ({ row }) => row.original.senderName ?? "Removed account",
        enableSorting: false,
        header: "Sent by",
        meta: { label: "Sent by" }
      },
      {
        accessorKey: "status",
        cell: ({ row }) => {
          const badge = STATUS_BADGE[row.original.status];
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
        enableSorting: false,
        header: "Status",
        meta: { label: "Status" }
      },
      {
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                ariaLabel: `Read the email to ${row.original.recipientName}: ${row.original.subject}`,
                icon: Eye,
                label: "Read email",
                onSelect: () => setViewing(row.original)
              }
            ]}
          />
        ),
        enableHiding: false,
        enableSorting: false,
        header: "Actions",
        id: "actions"
      }
    ],
    [tz]
  );

  const { table } = useDataTable<DirectEmailDto, unknown>({
    columns,
    data: query.data?.emails ?? [],
    getRowId: (row) => row.id,
    pageCount,
    pagination: serverTable.pagination,
    setPagination: serverTable.setPagination,
    setSorting: serverTable.setSorting,
    sorting: serverTable.sorting,
    ...serverTable.manual
  });

  return (
    <Card className="grid gap-4 p-4">
      {query.isError ? (
        <WidgetError message={query.error?.message} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTableToolbar
            filters={
              <Select
                aria-label="Filter by status"
                className="w-40"
                onChange={(event) => serverTable.setStatus(event.target.value)}
                options={SENT_STATUS_OPTIONS}
                value={serverTable.status}
              />
            }
            onSearchChange={serverTable.setSearch}
            searchPlaceholder="Search subject or address..."
            searchValue={serverTable.search}
          />
          <DataTable
            columnsLength={columns.length}
            isLoading={query.isLoading}
            noDataText="No emails yet."
            stackOnMobile
            table={table}
          />
          <DataTablePagination table={table} totalRows={query.data?.pagination.total ?? 0} />
        </>
      )}
      <p className="text-xs text-app-muted">Kept for a year, then removed.</p>

      <Dialog onOpenChange={(open) => !open && setViewing(null)} open={!!viewing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[600px]">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words">{viewing.subject}</DialogTitle>
                <DialogDescription className="break-all">
                  To {viewing.recipientName} ({viewing.toEmail}), {formatDateTime(viewing.sentAt ?? viewing.createdAt, tz)}
                </DialogDescription>
              </DialogHeader>
              {viewing.status === "FAILED" && (
                <Alert variant="error">This email did not go out{viewing.error ? `: ${viewing.error}` : "."}</Alert>
              )}
              {viewing.status === "PENDING" && (
                <Alert variant="warning">The server stopped before confirming this send, so it may not have gone out.</Alert>
              )}
              <FormattedText className="text-sm text-app-text" source={viewing.body} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
