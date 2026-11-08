import { Suspense } from "react";
import { KnowledgeAdminClient } from "@/features/knowledge/components/admin/KnowledgeAdminClient";
import { pageTitle } from "@/lib/pageTitles";
import { PageLoading } from "@/components/layout/PageLoading";

export const metadata = { title: pageTitle("/admin/knowledge") };

export default function AdminKnowledgePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <KnowledgeAdminClient />
    </Suspense>
  );
}
