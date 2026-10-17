import { AdminPayrollClient } from "@/features/payroll/components/AdminPayrollClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/finance/coach-payroll"),
};

export default function Page() {
  return <AdminPayrollClient />;
}
