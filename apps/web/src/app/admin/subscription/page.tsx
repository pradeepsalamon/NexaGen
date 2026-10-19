import { SubscriptionClient } from "@/features/subscription/components/SubscriptionClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/subscription"),
};

export default function AdminSubscriptionPage() {
  return <SubscriptionClient />;
}
