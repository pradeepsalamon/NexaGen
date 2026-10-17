import { CheckoutClient } from "@/features/payments/components/CheckoutClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/checkout/[planId]"),
};

export default async function Page(props: { params: Promise<{ planId: string }> }) {
  const params = await props.params;
  return <CheckoutClient planId={params.planId} />;
}
