import { Metadata } from "next";
import { BatchClassesClient } from "@/features/admin/components/BatchClassesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  title: pageTitle("/admin/classes"),
  description: "Manage and track all batch classes."
};

export default function AdminBatchClassesPage() {
  return <BatchClassesClient />;
}
