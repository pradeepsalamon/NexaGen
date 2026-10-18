import type { ReactNode } from "react";
import { layoutTitle } from "@/lib/pageTitles";

export const metadata = { title: layoutTitle("/register") };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
