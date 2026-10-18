import { AppShell } from "@/components/layout/AppShell";
import { GameViewerClient } from "@/features/game-library/components/GameViewerClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/games/[id]"),
};

export default async function GamePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <GameViewerClient id={params.id} />
        </div>
      </main>
    </AppShell>
  );
}
