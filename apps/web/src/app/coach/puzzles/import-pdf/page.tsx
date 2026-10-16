import { DiagramImportPageClient } from "@/features/diagram-import/components/DiagramImportPageClient";

export const metadata = { title: "Import diagrams from PDF - Coach Workspace" };

export default function CoachDiagramImportPage() {
  return <DiagramImportPageClient basePath="/coach/puzzles" />;
}
