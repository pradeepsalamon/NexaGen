import { AdminPayrollPeriodDetailClient } from "@/features/payroll/components/AdminPayrollPeriodDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/finance/coach-payroll/periods/[id]"),
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <AdminPayrollPeriodDetailClient periodId={params.id} />;
}
