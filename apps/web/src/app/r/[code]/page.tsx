import type { Metadata } from "next";
import { ReferralLandingClient } from "@/features/referrals/components/ReferralLandingClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: pageTitle("/r/[code]")
};

export default async function ReferralLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ReferralLandingClient code={code} />;
}
