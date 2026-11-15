import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContent } from "@/components/layout/PageContent";
import { HelpCenterClient } from "@/features/knowledge/components/HelpCenterClient";
import { pageTitle } from "@/lib/pageTitles";
import { PageLoading } from "@/components/layout/PageLoading";

export const metadata = {
  title: pageTitle("/help"),
};

export default function HelpPage() {
  return (
    <AppShell>
      <PageContent>
        {/* useSearchParams (?from=, ?q=, ?tab=) needs a Suspense boundary to prerender. */}
        <Suspense fallback={<PageLoading />}>
          <HelpCenterClient />
        </Suspense>
      </PageContent>
    </AppShell>
  );
}
