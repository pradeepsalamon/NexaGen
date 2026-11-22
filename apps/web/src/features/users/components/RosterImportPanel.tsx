"use client";

import { useRef, useState } from "react";
import { Download, FileUp, RotateCcw, Upload } from "lucide-react";
import {
  checkRosterRows,
  readRosterCsv,
  ROSTER_IMPORT_MAX_ROWS,
  ROSTER_IMPORT_TEMPLATE_CSV,
  type RosterImportResponse,
  type RosterImportRowOutcome
} from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { queryKeys } from "@/lib/queryKeys";
import { enumLabel } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { importRoster, previewRosterImport } from "../api/userApi";

const OUTCOME_LABEL: Record<RosterImportRowOutcome, { preview: string; done: string; variant: "success" | "secondary" | "destructive" | "warning" }> = {
  CREATE: { done: "Created", preview: "Will be created", variant: "success" },
  EXISTS: { done: "Already here", preview: "Already here", variant: "secondary" },
  INVALID: { done: "Not imported", preview: "Needs a fix", variant: "destructive" },
  NO_SEAT: { done: "No seat left", preview: "No seat left", variant: "warning" }
};

type Loaded = { fileName: string; rows: Record<string, string>[]; ignoredColumns: string[] };

/**
 * Roster import (docs/ROSTER_IMPORT.md): pick a CSV, see what each row will
 * become, then import. The file is read here; the API checks every row again.
 * undo: intentionally excluded — bulk create; each account can be archived or deleted afterwards.
 */
export function RosterImportPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [result, setResult] = useState<RosterImportResponse | null>(null);
  const [sendInvites, setSendInvites] = useState(true);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  const reset = () => {
    setLoaded(null);
    setFileErrors([]);
    setResult(null);
    if (input.current) input.current.value = "";
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([ROSTER_IMPORT_TEMPLATE_CSV], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "roster-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const choose = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    reset();
    const read = readRosterCsv(await file.text());
    if (read.fileErrors.length > 0) {
      setFileErrors(read.fileErrors);
      return;
    }
    setLoaded({ fileName: file.name, ignoredColumns: read.ignoredColumns, rows: read.rows });
    setBusy("preview");
    try {
      setResult(await previewRosterImport({ rows: read.rows, sendInvites }));
    } catch (error) {
      toast.error({ message: error instanceof Error ? error.message : undefined, title: "Couldn't check the file" });
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!loaded) return;
    setBusy("import");
    try {
      const done = await importRoster({ rows: loaded.rows, sendInvites });
      setResult(done);
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success({
        message: done.counts.CREATE > 0 && sendInvites ? "People with an email were sent an invite to set their password." : undefined,
        title: `${done.counts.CREATE} account(s) created`
      });
    } catch (error) {
      toast.error({ message: error instanceof Error ? error.message : undefined, title: "Import failed" });
    } finally {
      setBusy(null);
    }
  };

  const toCreate = result?.counts.CREATE ?? 0;
  const localProblems = loaded ? checkRosterRows(loaded.rows).filter((row) => !row.ok).length : 0;

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-5">
        <h3 className="font-bold">Import students and coaches</h3>
        <p className="text-sm text-app-muted">
          Save your spreadsheet as CSV with a header row. Only <strong>First name</strong> is required; the other columns are Last
          name, Email, Role (Student or Coach; empty means Student), Phone, Parent name, Parent email, Parent phone and Batch (the
          exact name of a batch that already exists). Up to {ROSTER_IMPORT_MAX_ROWS} people per file.
        </p>
        <p className="text-sm text-app-muted">
          Each person with an email gets an invite to choose their password. Someone without an email is still added, but can&apos;t
          sign in until you add their email and re-send the invite. Rows whose email already has an account are left as they are, so
          importing the same file twice is safe.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            accept=".csv,text/csv"
            className="sr-only"
            id="roster-import-file"
            onChange={(event) => void choose(event.target.files)}
            ref={input}
            type="file"
          />
          <Button disabled={busy !== null} onClick={() => input.current?.click()}>
            {busy === "preview" ? (
              <Spinner aria-hidden className="mr-2 size-4" />
            ) : (
              <FileUp aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
            )}
            Choose CSV file
          </Button>
          <Button onClick={downloadTemplate} variant="outline">
            <Download aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
            Download template
          </Button>
          <Switch checked={sendInvites} disabled={busy !== null} label="Send invite emails" onCheckedChange={setSendInvites} />
        </div>
        {fileErrors.length > 0 ? (
          <Alert title="This file can't be imported" variant="error">
            <ul className="list-disc pl-5">
              {fileErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {loaded && loaded.ignoredColumns.length > 0 ? (
          <Alert variant="warning">
            These columns aren&apos;t imported: {loaded.ignoredColumns.join(", ")}. Rename a column to one of the names above to use it.
          </Alert>
        ) : null}
      </Card>

      {loaded && result ? (
        <Card className="grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">{result.dryRun ? "Check before importing" : "Import finished"}</h3>
              <p className="text-sm text-app-muted">
                {loaded.fileName}: {result.rows.length} row(s). {summarize(result, localProblems)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={reset} variant="neutral">
                <RotateCcw aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
                {result.dryRun ? "Cancel" : "Import another file"}
              </Button>
              {result.dryRun ? (
                <Button disabled={busy !== null || toCreate === 0} onClick={() => void runImport()}>
                  {busy === "import" ? (
                    <Spinner aria-hidden className="mr-2 size-4" />
                  ) : (
                    <Upload aria-hidden className="mr-2 size-4" strokeWidth={2.5} />
                  )}
                  Import {toCreate} account(s)
                </Button>
              ) : null}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Row</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => {
                const label = OUTCOME_LABEL[row.outcome];
                return (
                  <TableRow key={row.row}>
                    <TableCell className="text-right tabular-nums">{row.row}</TableCell>
                    <TableCell>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>{row.email ?? <span className="text-app-muted">No email</span>}</TableCell>
                    <TableCell>{row.role ? enumLabel(row.role) : "—"}</TableCell>
                    <TableCell>{row.batchName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="grid gap-1">
                        <Badge variant={label.variant}>{result.dryRun ? label.preview : label.done}</Badge>
                        {row.messages.map((message) => (
                          <span className="text-xs text-app-muted" key={message}>
                            {message}
                          </span>
                        ))}
                        {!result.dryRun && row.outcome === "CREATE" && row.email ? (
                          <span className="text-xs text-app-muted">{row.invited ? "Invite sent" : "No invite sent"}</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function summarize(result: RosterImportResponse, localProblems: number): string {
  const { counts } = result;
  const parts = [
    `${counts.CREATE} ${result.dryRun ? "to create" : "created"}`,
    counts.EXISTS ? `${counts.EXISTS} already here` : null,
    counts.INVALID ? `${counts.INVALID} need a fix` : null,
    counts.NO_SEAT ? `${counts.NO_SEAT} over the plan's seats` : null
  ].filter(Boolean);
  const hint = result.dryRun && (counts.INVALID > 0 || localProblems > 0) ? " Fix those rows in the file and choose it again, or import the rest now." : "";
  return `${parts.join(", ")}.${hint}`;
}
