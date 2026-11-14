"use client";

import { useRef, useState } from "react";
import {
  EXTERNAL_CHESS_PROVIDER_LABELS,
  EXTERNAL_CHESS_PROVIDERS,
  EXTERNAL_VERIFICATION_FIELD,
  PGN_IMPORT_LIMITS,
  type ExternalChessAccountDto,
  type ExternalChessProvider,
  type GameAutoSyncPolicy,
  type GameAutoSyncRule,
  type ImportPgnSide,
} from "@nexa-chess/types";
import { CheckCircle2, Link2, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  useGameSources,
  useImportPgn,
  useLinkAccount,
  useSyncAccount,
  useUnlinkAccount,
  useVerifyAccount,
} from "../hooks/useGameAnalysis";
import { AutoSyncSwitch } from "./AutoSyncSwitch";

const SIDE_OPTIONS = [
  { label: "Find me by name", value: "AUTO" },
  { label: "I played White", value: "WHITE" },
  { label: "I played Black", value: "BLACK" },
];

/** A student's own games: upload PGNs, and (when enabled) linked Lichess / Chess.com accounts. */
export function GameSourcesCard() {
  const sources = useGameSources();
  const [uploading, setUploading] = useState(false);
  const enabled = sources.data?.config.externalImportEnabled ?? false;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold">Your games</h2>
          <p className="text-sm text-app-muted">Add games you played anywhere, then analyse them here.</p>
        </div>
        <Button onClick={() => setUploading(true)}>
          <Upload className="mr-2 size-4" aria-hidden />
          Upload PGN
        </Button>
      </div>
      {sources.isLoading ? (
        <Skeleton className="h-10 w-full rounded-control" />
      ) : sources.isError && !sources.data ? (
        <WidgetError message="Couldn't load your linked accounts." onRetry={() => void sources.refetch()} />
      ) : enabled ? (
        <LinkedAccounts
          accounts={sources.data?.accounts ?? []}
          policy={sources.data?.config.autoSyncPolicy ?? "OFF"}
          rule={sources.data?.autoSyncRule ?? null}
        />
      ) : (
        <p className="text-xs text-app-muted">Importing straight from Lichess or Chess.com isn’t switched on for this academy yet — download a PGN there and upload it.</p>
      )}
      <UploadDialog onOpenChange={setUploading} open={uploading} />
    </Card>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const upload = useImportPgn();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pgn, setPgn] = useState("");
  const [side, setSide] = useState<ImportPgnSide>("AUTO");
  const [names, setNames] = useState("");
  const [analyse, setAnalyse] = useState(true);
  const tooBig = pgn.length > PGN_IMPORT_LIMITS.maxChars;

  const readFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > PGN_IMPORT_LIMITS.maxChars) {
      toast.error("That file is too large. Split it into smaller PGNs.");
      return;
    }
    void file.text().then(setPgn);
  };

  const submit = () =>
    upload.mutate(
      {
        analyse,
        names: names.split(",").map((n) => n.trim()).filter(Boolean).slice(0, 5),
        pgn,
        side,
      },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : "The PGN could not be imported."),
        onSuccess: (res) => {
          const parts = [`${res.imported} imported`];
          if (res.duplicates) parts.push(`${res.duplicates} already there`);
          if (res.failed.length) parts.push(`${res.failed.length} could not be read`);
          if (res.analysesQueued) parts.push(`${res.analysesQueued} queued for analysis`);
          toast.success(parts.join(" · "));
          if (res.unmatchedSide) {
            toast.warning(`${res.unmatchedSide} game(s) didn't name you as a player, so they won't count in your insights.`);
          }
          setPgn("");
          onOpenChange(false);
        },
      },
    );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload games</DialogTitle>
          <DialogDescription>
            A PGN file with up to {PGN_IMPORT_LIMITS.maxGames} games. Each game is checked move by move; anything unreadable is skipped and reported.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              accept=".pgn,text/plain,application/x-chess-pgn"
              className="sr-only"
              id="pgn-file"
              onChange={(e) => readFile(e.target.files?.[0])}
              ref={fileRef}
              type="file"
            />
            <Button onClick={() => fileRef.current?.click()} variant="outline">
              Choose file
            </Button>
            <span className="text-xs text-app-muted">or paste below</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pgn-text">PGN</Label>
            <Textarea className="min-h-40 font-mono text-xs" id="pgn-text" onChange={(e) => setPgn(e.target.value)} value={pgn} />
            {tooBig && <p className="text-xs text-app-danger-ink">Too long — at most {PGN_IMPORT_LIMITS.maxChars.toLocaleString("en-US")} characters.</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pgn-side">Your colour</Label>
              <Select id="pgn-side" onChange={(e) => setSide(e.target.value as ImportPgnSide)} options={SIDE_OPTIONS} value={side} />
            </div>
            {side === "AUTO" && (
              <div className="space-y-1">
                <Label htmlFor="pgn-names">Names you play under</Label>
                <Input id="pgn-names" onChange={(e) => setNames(e.target.value)} placeholder="e.g. arjun_k, Arjun K" value={names} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-control border border-app-border p-3">
            <Label htmlFor="pgn-analyse">Analyse the new games</Label>
            <Switch checked={analyse} id="pgn-analyse" onCheckedChange={setAnalyse} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!pgn.trim() || tooBig || upload.isPending} onClick={submit}>
            {upload.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkedAccounts({
  accounts,
  policy,
  rule,
}: {
  accounts: ExternalChessAccountDto[];
  policy: GameAutoSyncPolicy;
  rule: GameAutoSyncRule | null;
}) {
  const link = useLinkAccount();
  const [provider, setProvider] = useState<ExternalChessProvider>("LICHESS");
  const [username, setUsername] = useState("");
  const free = EXTERNAL_CHESS_PROVIDERS.filter((p) => !accounts.some((a) => a.provider === p));

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Linked accounts</h3>
      {accounts.map((a) => (
        <AccountRow account={a} key={a.id} policy={policy} rule={rule} />
      ))}
      {free.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
          <div className="space-y-1 sm:w-40">
            <Label htmlFor="link-provider">Site</Label>
            <Select
              id="link-provider"
              onChange={(e) => setProvider(e.target.value as ExternalChessProvider)}
              options={free.map((p) => ({ label: EXTERNAL_CHESS_PROVIDER_LABELS[p], value: p }))}
              value={free.includes(provider) ? provider : free[0]}
            />
          </div>
          <div className="space-y-1 sm:w-56">
            <Label htmlFor="link-username">Username</Label>
            <Input id="link-username" onChange={(e) => setUsername(e.target.value)} value={username} />
          </div>
          <Button
            disabled={!username.trim() || link.isPending}
            onClick={() =>
              link.mutate(
                { provider: free.includes(provider) ? provider : free[0], username: username.trim() },
                {
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Could not link the account."),
                  onSuccess: () => setUsername(""),
                },
              )
            }
            variant="outline"
          >
            <Link2 className="mr-2 size-4" aria-hidden />
            Link
          </Button>
        </div>
      )}
      <p className="text-xs text-app-muted">Only your username is stored — never a password. Games are read from the site’s public data.</p>
    </section>
  );
}

function AccountRow({
  account,
  policy,
  rule,
}: {
  account: ExternalChessAccountDto;
  policy: GameAutoSyncPolicy;
  rule: GameAutoSyncRule | null;
}) {
  const tz = useUserTimeZone();
  const verify = useVerifyAccount();
  const sync = useSyncAccount();
  const unlink = useUnlinkAccount();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [deleteGames, setDeleteGames] = useState(false);
  const label = EXTERNAL_CHESS_PROVIDER_LABELS[account.provider];
  const coolingDown = account.nextSyncAllowedAt ? new Date(account.nextSyncAllowedAt).getTime() > Date.now() : false;

  return (
    <div className="space-y-2 rounded-control border border-app-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <a className="truncate font-semibold text-primary-ink underline-offset-2 hover:underline" href={account.profileUrl} rel="noreferrer" target="_blank">
            {label} · {account.username}
          </a>
          {account.verified ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 size-3" aria-hidden /> Verified
            </Badge>
          ) : (
            <Badge variant="warning">Not verified</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {account.verified && (
            <Button
              disabled={sync.isPending || coolingDown || account.syncStatus === "SYNCING"}
              onClick={() =>
                sync.mutate(
                  { analyse: true, id: account.id },
                  {
                    onError: (err) => toast.error(err instanceof Error ? err.message : "The import failed."),
                    onSuccess: (res) =>
                      toast.success(
                        `${res.imported} new game(s)${res.analysesQueued ? `, ${res.analysesQueued} queued for analysis` : ""}${res.more ? " — import again for more" : ""}`,
                      ),
                  },
                )
              }
              variant="outline"
            >
              {sync.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 size-4" aria-hidden />}
              Import games
            </Button>
          )}
          <SimpleTooltip label="Unlink account">
            <Button
              aria-label="Unlink account"
              className="rounded-full bg-app-danger text-white hover:bg-app-danger/85"
              onClick={() => setConfirmUnlink(true)}
              size="icon"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      {!account.verified && account.verificationCode && (
        <div className="space-y-2">
          <p className="text-sm">
            To prove it’s you, put <code className="rounded-control bg-app-soft px-1.5 py-0.5 font-mono text-sm">{account.verificationCode}</code> in{" "}
            {EXTERNAL_VERIFICATION_FIELD[account.provider]}, save, then check.
          </p>
          <div className="flex justify-end">
            <Button
              disabled={verify.isPending}
              onClick={() =>
                verify.mutate(account.id, {
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Verification failed."),
                  onSuccess: () => toast.success("Account verified — you can remove the code from your profile now."),
                })
              }
            >
              Check now
            </Button>
          </div>
        </div>
      )}
      {account.verified && <AutoSyncSwitch account={account} policy={policy} rule={rule} />}
      {account.syncError && account.syncStatus !== "IDLE" && <Alert variant="warning">{account.syncError}</Alert>}
      {account.lastSyncedAt && (
        <p className="text-xs text-app-muted">
          {account.gamesImported} games imported · last import {formatDateTime(account.lastSyncedAt, tz)}
          {coolingDown && account.nextSyncAllowedAt ? ` · next import after ${formatDateTime(account.nextSyncAllowedAt, tz)}` : ""}
        </p>
      )}

      <Dialog onOpenChange={setConfirmUnlink} open={confirmUnlink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink {label}?</DialogTitle>
            <DialogDescription>New games stop coming in. You can also remove the games already imported from this account.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-control border border-app-border p-3">
            <Label htmlFor={`delete-games-${account.id}`}>Also delete its {account.gamesImported} imported games</Label>
            <Switch checked={deleteGames} id={`delete-games-${account.id}`} onCheckedChange={setDeleteGames} />
          </div>
          <DialogFooter>
            <Button onClick={() => setConfirmUnlink(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={unlink.isPending}
              onClick={() =>
                unlink.mutate(
                  { deleteGames, id: account.id },
                  {
                    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not unlink."),
                    onSuccess: () => setConfirmUnlink(false),
                  },
                )
              }
              variant="destructive"
            >
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
