import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-[calc(100dvh-4rem)] p-3 sm:p-4 lg:p-5">
      {children}
    </main>
  );
}
