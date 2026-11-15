import { CertificateCheckClient } from "@/features/tournaments/components/PublicClients";
import { pageTitle } from "@/lib/pageTitles";

// Public spectating: nothing personal is shown, but keep these pages out of search results.
export const metadata = {
  robots: { follow: false, index: false },
  title: pageTitle("/certificates/[code]"),
};

export default async function CertificateCheckPage(props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  return <CertificateCheckClient code={params.code} />;
}
