import { AdminFinanceClient } from "@/features/invoices/components/AdminFinanceClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/finance/invoices"),
};

export default function Page() {
  return <AdminFinanceClient />;
}
