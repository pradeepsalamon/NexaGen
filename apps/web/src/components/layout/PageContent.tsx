import type { ReactNode } from "react";

/** The page ground, padding and content width every role area shares. */
export function PageContent({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100dvh-64px)] bg-app-background text-app-text">
      <main className="min-w-0 overflow-x-clip p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
