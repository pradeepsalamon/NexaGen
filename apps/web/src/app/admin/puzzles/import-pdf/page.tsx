import { DiagramImportPageClient } from "@/features/diagram-import/components/DiagramImportPageClient";

export const metadata = { title: "Import diagrams from PDF - Admin" };

export default function AdminDiagramImportPage() {
  return <DiagramImportPageClient basePath="/admin/puzzles" />;
}
