import { ReferralBoardClient } from "@/features/referrals/components/ReferralBoardClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student/referrals") };

export default function StudentReferralsPage() {
  return <ReferralBoardClient />;
}
