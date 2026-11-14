import { PublicListClient } from "@/features/tournaments/components/PublicClients";
import { pageTitle } from "@/lib/pageTitles";

// Public spectating: nothing personal is shown, but keep these pages out of search results.
export const metadata = {
  robots: { follow: false, index: false },
  title: pageTitle("/watch"),
};

export default function WatchTournamentsPage() {
  return <PublicListClient />;
}
