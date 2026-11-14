import { AppShell } from "@/components/layout/AppShell";
import { HelpArticleClient } from "@/features/knowledge/components/HelpArticleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/help/[slug]"),
};

export default async function HelpArticlePage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <HelpArticleClient slug={params.slug} />
      </main>
    </AppShell>
  );
}
