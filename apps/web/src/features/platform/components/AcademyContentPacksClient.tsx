"use client";

import { Copy, Eye, Package } from "lucide-react";
import { useState } from "react";
import type { ContentPackItemSummary, ContentPackSummary } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { enumLabel } from "@/lib/utils";
import {
  useAcademyContentPackFolder,
  useAcademyContentPacks,
  useCopyAcademyContentPackFolder
} from "../hooks/usePlatformApi";

type Selection = { item: ContentPackItemSummary; pack: ContentPackSummary };

function PreviewDialog({ onClose, onCopy, selection }: { onClose: () => void; onCopy: () => void; selection: Selection }) {
  const folder = useAcademyContentPackFolder(selection.pack.id, selection.item.id);
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{selection.item.title}</DialogTitle>
          <DialogDescription>From {selection.pack.name}. Copy it to edit, file or assign these puzzles.</DialogDescription>
        </DialogHeader>
        {folder.isError ? (
          <WidgetError message="Could not load this folder." onRetry={() => void folder.refetch()} />
        ) : !folder.data ? (
          <Skeleton className="h-32 w-full" />
        ) : folder.data.puzzles.length === 0 ? (
          <p className="text-sm text-app-muted">This folder has no puzzles yet.</p>
        ) : (
          <ul className="divide-y divide-app-border rounded-app border border-app-border">
            {folder.data.puzzles.map((puzzle) => (
              <li className="flex flex-wrap items-center gap-2 px-3 py-2" key={puzzle.id}>
                <span className="min-w-0 flex-1 truncate text-sm text-app-text">{puzzle.title}</span>
                <Badge variant="outline">{enumLabel(puzzle.puzzleType)}</Badge>
                <Badge variant="secondary">{enumLabel(puzzle.difficulty)}</Badge>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Close
          </Button>
          <Button disabled={!folder.data?.puzzles.length} onClick={onCopy} type="button">
            Copy to my library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `/admin/content-packs`: ready-made puzzle folders from NexaChess that the academy's plan includes. */
export function AcademyContentPacksClient() {
  const packs = useAcademyContentPacks();
  const copy = useCopyAcademyContentPackFolder();
  const [previewing, setPreviewing] = useState<Selection | null>(null);

  const copyFolder = (selection: Selection) => copy.mutate({ itemId: selection.item.id, packId: selection.pack.id });

  return (
    <div>
      <PageHeader
        description="Puzzle folders from NexaChess included in your plan. Copying makes a folder your own: later changes to the pack don't touch your copy."
        title="Content packs"
      />
      {packs.isError ? (
        <WidgetError message="Could not load content packs." onRetry={() => void packs.refetch()} />
      ) : packs.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (packs.data?.packs ?? []).length === 0 ? (
        <EmptyState
          description="Your plan doesn't include any content packs yet. Ask the NexaChess team what's available."
          icon={Package}
          title="No content packs"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(packs.data?.packs ?? []).map((pack) => (
            <section className="rounded-panel border border-app-border bg-app-surface p-4 shadow-card" key={pack.id}>
              <h2 className="font-semibold text-app-text">{pack.name}</h2>
              {pack.description ? <p className="mt-1 text-sm text-app-muted">{pack.description}</p> : null}
              <ul className="mt-3 divide-y divide-app-border rounded-app border border-app-border">
                {pack.items.map((item) => (
                  <li className="flex items-center gap-3 px-3 py-2" key={item.id}>
                    <span className="min-w-0 flex-1 truncate text-sm text-app-text">{item.title}</span>
                    <span className="text-xs text-app-muted">{item.puzzleCount} puzzles</span>
                    <RowActions
                      actions={[
                        {
                          ariaLabel: `Preview ${item.title}`,
                          icon: Eye,
                          label: "Preview",
                          onSelect: () => setPreviewing({ item, pack })
                        },
                        {
                          ariaLabel: `Copy ${item.title} to my library`,
                          disabled: copy.isPending,
                          icon: Copy,
                          label: "Copy to my library",
                          onSelect: () => copyFolder({ item, pack })
                        }
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {previewing ? (
        <PreviewDialog
          onClose={() => setPreviewing(null)}
          onCopy={() => {
            copyFolder(previewing);
            setPreviewing(null);
          }}
          selection={previewing}
        />
      ) : null}
    </div>
  );
}
