import { AppShell } from "@/components/layout/AppShell";
import { PageContent } from "@/components/layout/PageContent";
import { HelpArticleClient } from "@/features/knowledge/components/HelpArticleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/help/[slug]"),
};

export default async function HelpArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return (
    <AppShell>
      <PageContent>
        <HelpArticleClient slug={params.slug} />
      </PageContent>
    </AppShell>
  );
}
