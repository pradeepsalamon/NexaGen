"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useImportGame } from "../hooks/useGameLibrary";

const MAX_FILE_BYTES = 200_000;

/** Coach/admin: paste or upload one PGN game (variations and comments are kept). */
export function ImportGameDialog({
  open,
  onOpenChange,
  batches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const importGame = useImportGame();
  const [pgn, setPgn] = useState("");
  const [title, setTitle] = useState("");
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large (200 KB max).");
      return;
    }
    setPgn(await file.text());
    setError(null);
  };

  const submit = () => {
    setError(null);
    importGame.mutate(
      { batchId: batchId || undefined, pgn, title: title.trim() || undefined },
      {
        onError: (err) => setError(err instanceof Error ? err.message : "That PGN could not be imported."),
        onSuccess: (game) => {
          toast.success("Game imported");
          onOpenChange(false);
          router.push(`/games/${game.id}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a PGN</DialogTitle>
          <DialogDescription>
            The first game in the file is imported. Variations, comments and move annotations ($1, !, ?) are kept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="import-pgn">PGN</Label>
            <Textarea
              id="import-pgn"
              className="min-h-[180px] font-mono text-xs"
              placeholder={'[White "Player A"]\n[Black "Player B"]\n\n1. e4 e5 (1... c5) 2. Nf3 *'}
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
            />
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline">
              <FileUp className="size-3.5" aria-hidden />
              Or choose a .pgn file
              <input
                type="file"
                accept=".pgn,text/plain,application/x-chess-pgn"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-title">Title (optional)</Label>
              <Input id="import-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="From the PGN if empty" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-batch">Batch (optional)</Label>
              <Select
                id="import-batch"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                options={[{ label: "No batch", value: "" }, ...batches.map((b) => ({ label: b.name, value: b.id }))]}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-control border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-sm text-app-danger-ink">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!pgn.trim() || importGame.isPending}>
            {importGame.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
