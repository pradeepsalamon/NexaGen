import { ReferralBoardClient } from "@/features/referrals/components/ReferralBoardClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/referrals") };

export default function CoachReferralsPage() {
  return <ReferralBoardClient />;
}
