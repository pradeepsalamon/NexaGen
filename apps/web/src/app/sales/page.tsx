import { ReferralBoardClient } from "@/features/referrals/components/ReferralBoardClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/sales") };

export default function SalesBoardPage() {
  return <ReferralBoardClient />;
}
