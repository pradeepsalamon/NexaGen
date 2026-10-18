import { AdminChessAppearanceClient } from "@/features/chess-appearance/components/AdminChessAppearanceClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/chess-appearance"),
};

export default function AdminChessAppearancePage() {
  return <AdminChessAppearanceClient />;
}
