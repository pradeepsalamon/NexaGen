import { AppShell } from "@/components/layout/AppShell";
import { MyHistoryClient } from "@/features/tournaments/components/HistoryClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/tournaments/history"),
};

export default function TournamentHistoryPage() {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] overflow-x-clip bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <MyHistoryClient />
        </div>
      </main>
    </AppShell>
  );
}
