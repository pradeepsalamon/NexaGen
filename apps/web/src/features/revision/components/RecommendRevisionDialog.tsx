"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  REVISION_MAX_RECOMMEND,
  isSystemPuzzleFolder,
  puzzleTopicPathLabel,
  type RevisionRecommendRequest
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { getPuzzleTopics, getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { recommendRevision } from "../api/revisionApi";

type Mode = "puzzles" | "folder";

/**
 * Recommend library content for one student's revision: published puzzles
 * (search, pick up to 20) or one folder, reviewed as a concept. The API
 * re-checks that the student may open each one and that the coach may see it.
 */
export function RecommendRevisionDialog({
  open,
  onOpenChange,
  studentId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("puzzles");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [topicId, setTopicId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setTopicId("");
    setNote("");
    setSearch("");
  }, [open]);

  const listQuery = { page: 1, pageSize: 20, search: debounced || undefined, status: "PUBLISHED" as const };
  const puzzles = useQuery({
    enabled: open && mode === "puzzles",
    placeholderData: keepPreviousData,
    queryFn: () => getPuzzles(listQuery),
    queryKey: queryKeys.puzzles.list(listQuery)
  });
  const topics = useQuery({ enabled: open, queryFn: getPuzzleTopics, queryKey: queryKeys.puzzles.topics });
  const topicOptions = useMemo(() => {
    const all = topics.data?.topics ?? [];
    return all
      .filter((t) => !isSystemPuzzleFolder(t))
      .map((t) => ({ label: puzzleTopicPathLabel(all, t.id), value: t.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [topics.data]);

  // undo: intentionally excluded — a recommendation can update an item the student already had (no clean
  // reverse); withdrawing it is the Remove button in the list, which has its own Undo.
  const submit = useMutation({
    mutationFn: (body: RevisionRecommendRequest) => recommendRevision(studentId, body),
    onError: (error) => toast.error({ message: (error as Error).message, title: "Couldn't recommend" }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.revision.report(studentId) });
      toast.success({
        message:
          res.updated > 0
            ? `${res.added} added, ${res.updated} already in their revision (brought forward to now).`
            : "It's due in their next revision session.",
        title: res.added + res.updated === 1 ? "Recommended for revision" : `${res.added + res.updated} items recommended`
      });
      onOpenChange(false);
    }
  });

  const toggle = (id: string) =>
    setPicked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else if (next.size < REVISION_MAX_RECOMMEND) next.add(id);
      return next;
    });

  const canSubmit = mode === "puzzles" ? picked.size > 0 : !!topicId;
  const send = () =>
    submit.mutate({
      note: note.trim() || undefined,
      ...(mode === "puzzles" ? { puzzleIds: [...picked] } : { topicId })
    });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Recommend for revision</DialogTitle>
          <DialogDescription>
            It goes straight into the student&apos;s revision queue, due now. They solve it, then rate how well they
            remembered it.
          </DialogDescription>
        </DialogHeader>

        <Tabs className="min-w-0" onValueChange={(v) => setMode(v as Mode)} value={mode}>
          <TabsList aria-label="What to recommend">
            <TabsTrigger value="puzzles">Puzzles</TabsTrigger>
            <TabsTrigger value="folder">Folder (concept)</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-3" value="puzzles">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
              <Input
                aria-label="Search published puzzles"
                className="pl-9"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search published puzzles"
                value={search}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-control border border-app-border">
              {puzzles.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : puzzles.isError ? (
                <p className="p-4 text-sm text-app-danger-ink">{(puzzles.error as Error).message}</p>
              ) : (puzzles.data?.puzzles.length ?? 0) === 0 ? (
                <p className="p-4 text-center text-sm text-app-muted">No published puzzles match.</p>
              ) : (
                <ul className="divide-y divide-app-border">
                  {puzzles.data!.puzzles.map((p) => {
                    const id = `rev-pick-${p.id}`;
                    return (
                      <li className="flex items-center gap-3 px-3 py-2" key={p.id}>
                        <Checkbox checked={picked.has(p.id)} id={id} onCheckedChange={() => toggle(p.id)} />
                        <Label className="min-w-0 flex-1 cursor-pointer" htmlFor={id}>
                          <span className="block truncate text-sm font-semibold text-app-text">{p.title}</span>
                          <span className="block truncate text-xs font-normal text-app-muted">
                            {p.topicName} · {p.difficulty.toLowerCase()}
                          </span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-xs text-app-muted">
              {picked.size} of up to {REVISION_MAX_RECOMMEND} selected
            </p>
          </TabsContent>

          <TabsContent className="space-y-2" value="folder">
            <Label htmlFor="rev-folder">Folder</Label>
            <Select
              id="rev-folder"
              onChange={(e) => setTopicId(e.target.value)}
              options={topicOptions}
              placeholder={topics.isLoading ? "Loading folders…" : "Choose a folder"}
              value={topicId}
            />
            <p className="text-xs text-app-muted">
              Each review serves one of the folder&apos;s published puzzles (subfolders included), new ones first.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="rev-note">Note for the student (optional)</Label>
          <Textarea id="rev-note" maxLength={300} onChange={(e) => setNote(e.target.value)} rows={2} value={note} />
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={send} type="button">
            Recommend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
