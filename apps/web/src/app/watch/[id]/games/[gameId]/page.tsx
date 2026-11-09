import { PublicGameClient } from "@/features/tournaments/components/PublicClients";
import { pageTitle } from "@/lib/pageTitles";

// Public spectating: nothing personal is shown, but keep these pages out of search results.
export const metadata = {
  robots: { follow: false, index: false },
  title: pageTitle("/watch/[id]/games/[gameId]"),
};

export default async function WatchGamePage(props: { params: Promise<{ id: string; gameId: string }> }) {
  const params = await props.params;
  return <PublicGameClient tournamentId={params.id} gameId={params.gameId} />;
}
