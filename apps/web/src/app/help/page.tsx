import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { HelpCenterClient } from "@/features/knowledge/components/HelpCenterClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/help"),
};

export default function HelpPage() {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          {/* useSearchParams (?from=, ?q=, ?tab=) needs a Suspense boundary to prerender. */}
          <Suspense fallback={null}>
            <HelpCenterClient />
          </Suspense>
        </div>
      </main>
    </AppShell>
  );
}
