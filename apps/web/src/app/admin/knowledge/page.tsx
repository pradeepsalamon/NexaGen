import { Suspense } from "react";
import { KnowledgeAdminClient } from "@/features/knowledge/components/admin/KnowledgeAdminClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/knowledge") };

export default function AdminKnowledgePage() {
  return (
    <Suspense fallback={null}>
      <KnowledgeAdminClient />
    </Suspense>
  );
}
