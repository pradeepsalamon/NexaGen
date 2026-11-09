import { WatchClient } from "@/features/tournaments/components/PublicClients";
import { pageTitle } from "@/lib/pageTitles";

// Public spectating: nothing personal is shown, but keep these pages out of search results.
export const metadata = {
  robots: { follow: false, index: false },
  title: pageTitle("/watch/[id]"),
};

export default async function WatchTournamentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <WatchClient tournamentId={params.id} />;
}
