"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { DiagramImportWorkbench } from "./DiagramImportWorkbench";
import { DiagramPositionActions } from "./DiagramPositionActions";

/** /coach/puzzles/import-pdf and /admin/puzzles/import-pdf. */
export function DiagramImportPageClient({ basePath }: { basePath: string }) {
  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        breadcrumbs={[{ href: basePath, label: "Puzzle library" }, { label: "Import from PDF" }]}
        description="Find the diagrams in a chess book or worksheet, check each position against the page, then open it on the analysis board or turn it into a puzzle. Nothing is shared with students from here."
        title="Import chess diagrams from a PDF"
      />
      <DiagramImportWorkbench
        actions={(confirmed) => <DiagramPositionActions confirmed={confirmed} libraryBasePath={basePath} />}
      />
    </div>
  );
}
