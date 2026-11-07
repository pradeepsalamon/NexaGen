import { Suspense } from "react";
import { KnowledgeArticleEditorClient } from "@/features/knowledge/components/admin/KnowledgeArticleEditorClient";
import { pageTitle } from "@/lib/pageTitles";
import { PageLoading } from "@/components/layout/PageLoading";

export const metadata = { title: pageTitle("/admin/knowledge/new") };

export default function AdminNewKnowledgeArticlePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <KnowledgeArticleEditorClient id={null} />
    </Suspense>
  );
}
