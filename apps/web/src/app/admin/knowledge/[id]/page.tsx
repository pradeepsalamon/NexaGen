import { Suspense } from "react";
import { KnowledgeArticleEditorClient } from "@/features/knowledge/components/admin/KnowledgeArticleEditorClient";
import { pageTitle } from "@/lib/pageTitles";
import { PageLoading } from "@/components/layout/PageLoading";

export const metadata = { title: pageTitle("/admin/knowledge/[id]") };

export default async function AdminKnowledgeArticlePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <Suspense fallback={<PageLoading />}>
      <KnowledgeArticleEditorClient id={params.id} />
    </Suspense>
  );
}
