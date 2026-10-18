import { PlansClient } from "@/features/payments/components/PlansClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/plans"),
};

export default function Page() {
  return <PlansClient />;
}
