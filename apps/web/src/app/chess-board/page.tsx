import { AppShell } from "@/components/layout/AppShell";
import { UserChessAppearanceSettingsClient } from "@/features/chess-appearance/components/UserChessAppearanceSettingsClient";

export const metadata = {
  title: "Chess Board - Nexa Chess",
};

export default function ChessBoardSettingsPage() {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <UserChessAppearanceSettingsClient />
        </div>
      </main>
    </AppShell>
  );
}
