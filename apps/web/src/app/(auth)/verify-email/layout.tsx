import type { ReactNode } from "react";
import { layoutTitle } from "@/lib/pageTitles";

export const metadata = { title: layoutTitle("/verify-email") };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
