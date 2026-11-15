import { SupportEnterClient } from "@/features/platform/components/SupportEnterClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { robots: { follow: false, index: false }, title: pageTitle("/support/enter") };

export default async function SupportEnterPage(props: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await props.searchParams;
  return <SupportEnterClient token={typeof token === "string" && token.length > 0 ? token : null} />;
}
