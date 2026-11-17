"use client";

import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
import { getErrorMessage } from "@/lib/errors";
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
import { Spinner } from "@/components/ui/Spinner";

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
  // About the PGN field (file too big or unreadable); a refused import is a toast.
  const [error, setError] = useState<string | null>(null);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    // Cleared so picking the same file again still fires onChange.
    input.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large (200 KB max)");
      return;
    }
    try {
      setPgn(await file.text());
      setError(null);
    } catch {
      setError("That file could not be read");
    }
  };

  // No closing mid-import: the request would finish with nowhere to report.
  const handleOpenChange = (next: boolean) => {
    if (!next && importGame.isPending) return;
    onOpenChange(next);
  };

  const submit = () => {
    setError(null);
    importGame.mutate(
      { batchId: batchId || undefined, pgn, title: title.trim() || undefined },
      {
        onError: (err) => toast.error("That PGN could not be imported", { description: getErrorMessage(err) }),
        onSuccess: (game) => {
          toast.success("Game imported");
          onOpenChange(false);
          router.push(`/games/${game.id}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a PGN</DialogTitle>
          <DialogDescription>
            The first game in the file is imported. Variations, comments and move annotations ($1, !, ?) are kept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative space-y-1.5">
            <Label htmlFor="import-pgn">PGN</Label>
            <Textarea
              id="import-pgn"
              className="min-h-[180px] font-mono text-xs"
              placeholder={'[White "Player A"]\n[Black "Player B"]\n\n1. e4 e5 (1... c5) 2. Nf3 *'}
              value={pgn}
              aria-describedby={error ? fieldErrorId("import-pgn") : undefined}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setPgn(e.target.value);
                setError(null);
              }}
            />
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline">
              <FileUp className="size-3.5" aria-hidden />
              Or choose a .pgn file
              <input
                type="file"
                accept=".pgn,text/plain,application/x-chess-pgn"
                className="sr-only"
                onChange={(e) => void onFile(e.target)}
              />
            </label>
            <FieldError id="import-pgn" message={error} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
        <DialogFooter>
          <Button variant="neutral" disabled={importGame.isPending} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!pgn.trim() || importGame.isPending}>
            {importGame.isPending && <Spinner className="mr-2 size-4" aria-hidden />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
