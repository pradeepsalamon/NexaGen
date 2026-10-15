import { AppShell } from "@/components/layout/AppShell";
import { GameLibraryClient } from "@/features/game-library/components/GameLibraryClient";

export const metadata = {
  title: "Game Library - Nexa Chess",
};

export default function GameLibraryPage() {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <GameLibraryClient />
        </div>
      </main>
    </AppShell>
  );
}
