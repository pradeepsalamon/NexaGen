import { AppShell } from "@/components/layout/AppShell";
import { ManageClient } from "@/features/tournaments/components/ManageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/tournaments/[id]/manage"),
};

export default async function ManageTournamentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] overflow-x-clip bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <ManageClient tournamentId={params.id} />
        </div>
      </main>
    </AppShell>
  );
}
