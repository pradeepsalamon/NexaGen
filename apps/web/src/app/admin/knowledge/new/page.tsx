import { Suspense } from "react";
import { KnowledgeArticleEditorClient } from "@/features/knowledge/components/admin/KnowledgeArticleEditorClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/knowledge/new") };

export default function AdminNewKnowledgeArticlePage() {
  return (
    <Suspense fallback={null}>
      <KnowledgeArticleEditorClient id={null} />
    </Suspense>
  );
}
