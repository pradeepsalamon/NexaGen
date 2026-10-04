import { redirect } from "next/navigation";

export default function PendingCoachesRedirect() {
  redirect("/admin/approvals?tab=coaches");
}
