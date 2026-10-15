import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MessagesClient } from "@/features/chat/components/MessagesClient";

export const metadata = {
  title: "Messages - Nexa Chess",
};

export default function MessagesPage() {
  return (
    <AppShell>
      <main className="bg-app-background px-3 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* useSearchParams (the open thread) needs a Suspense boundary to prerender. */}
          <Suspense fallback={null}>
            <MessagesClient />
          </Suspense>
        </div>
      </main>
    </AppShell>
  );
}
