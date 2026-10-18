import { DiagramImportPageClient } from "@/features/diagram-import/components/DiagramImportPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/puzzles/import-pdf") };

export default function CoachDiagramImportPage() {
  return <DiagramImportPageClient basePath="/coach/puzzles" />;
}
