import type { Metadata } from "next";
import { UpcomingClassesClient } from "@/features/upcoming-classes/components/UpcomingClassesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  title: pageTitle("/admin/upcoming-classes"),
  description: "Every batch's upcoming classes and the demo classes in one list."
};

export default function AdminUpcomingClassesPage() {
  return <UpcomingClassesClient />;
}
