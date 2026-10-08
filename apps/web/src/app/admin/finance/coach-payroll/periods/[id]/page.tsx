import { AdminPayrollPeriodDetailClient } from "@/features/payroll/components/AdminPayrollPeriodDetailClient";

export const metadata = {
  title: "Payroll Period - Admin",
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <AdminPayrollPeriodDetailClient periodId={params.id} />;
}
