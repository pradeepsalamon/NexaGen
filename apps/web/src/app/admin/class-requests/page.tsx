import { redirect } from "next/navigation";

// Class requests moved into the shared request inbox (Stage 5 of
// docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md); old links land there.
export default function AdminClassRequestsPage() {
  redirect("/admin/requests");
}
