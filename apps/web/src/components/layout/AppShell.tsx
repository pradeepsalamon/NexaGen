import type { ReactNode } from "react";
import { Header } from "./Header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <div className="pt-16">{children}</div>
    </>
  );
}
