import { redirect } from "next/navigation";

export default function PendingStudentsRedirect() {
  redirect("/admin/approvals?tab=students");
}
