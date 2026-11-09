import { AppShell } from "@/components/layout/AppShell";
import { TournamentGameClient } from "@/features/tournaments/components/TournamentGameClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/tournaments/[id]/games/[gameId]"),
};

export default async function TournamentGamePage(props: { params: Promise<{ id: string; gameId: string }> }) {
  const params = await props.params;
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] overflow-x-clip bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <TournamentGameClient tournamentId={params.id} gameId={params.gameId} />
        </div>
      </main>
    </AppShell>
  );
}
