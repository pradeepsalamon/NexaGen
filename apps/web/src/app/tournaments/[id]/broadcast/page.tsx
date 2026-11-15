import { AppShell } from "@/components/layout/AppShell";
import { BroadcastClient } from "@/features/tournaments/components/BroadcastClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/tournaments/[id]/broadcast"),
};

export default async function TournamentBroadcastPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] overflow-x-clip bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <BroadcastClient tournamentId={params.id} />
        </div>
      </main>
    </AppShell>
  );
}
