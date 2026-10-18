import { DiagramImportPageClient } from "@/features/diagram-import/components/DiagramImportPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles/import-pdf") };

export default function AdminDiagramImportPage() {
  return <DiagramImportPageClient basePath="/admin/puzzles" />;
}
