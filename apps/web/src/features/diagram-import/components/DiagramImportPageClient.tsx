"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { DiagramImportWorkbench } from "./DiagramImportWorkbench";
import { DiagramPositionActions } from "./DiagramPositionActions";

/** /coach/puzzles/import-pdf and /admin/puzzles/import-pdf. */
export function DiagramImportPageClient({ basePath }: { basePath: string }) {
  return (
    <div>
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={basePath}>
              <ArrowLeft className="size-4" strokeWidth={2.5} />
              Puzzle library
            </Link>
          </Button>
        }
        description="Find the diagrams in a chess book or worksheet, check each position against the page, then open it on the analysis board or turn it into a puzzle. Nothing is shared with students from here."
        title="Import chess diagrams from a PDF"
      />
      <DiagramImportWorkbench
        actions={(confirmed) => <DiagramPositionActions confirmed={confirmed} libraryBasePath={basePath} />}
      />
    </div>
  );
}
