import { CheckoutClient } from "@/features/payments/components/CheckoutClient";

export const metadata = {
  title: "Checkout - NexaChess",
};

export default async function Page(props: { params: Promise<{ planId: string }> }) {
  const params = await props.params;
  return <CheckoutClient planId={params.planId} />;
}
