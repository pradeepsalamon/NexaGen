import { Metadata } from "next";
import { BatchClassesClient } from "@/features/admin/components/BatchClassesClient";

export const metadata: Metadata = {
  title: "Batch Classes | Admin | Nexa Chess",
  description: "Manage and track all batch classes."
};

export default function AdminBatchClassesPage() {
  return <BatchClassesClient />;
}
