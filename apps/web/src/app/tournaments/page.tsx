import { AppShell } from "@/components/layout/AppShell";
import { TournamentsClient } from "@/features/tournaments/components/TournamentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/tournaments"),
};

export default function TournamentsPage() {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] overflow-x-clip bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <TournamentsClient />
        </div>
      </main>
    </AppShell>
  );
}
