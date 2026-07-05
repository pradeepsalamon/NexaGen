import type { Metadata } from "next";
import { UserManagementClient } from "@/features/users/components/UserManagementClient";

export const metadata: Metadata = {
  description: "Manage users, roles, and statuses.",
  title: "User Management - Admin | Nexa Gen"
};

export default function UsersPage() {
  return <UserManagementClient />;
}
