import type { Metadata } from "next";
import { UserManagementClient } from "@/features/users/components/UserManagementClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  description: "Manage users, roles, and statuses.",
  title: pageTitle("/admin/users")
};

export default function UsersPage() {
  return <UserManagementClient />;
}
