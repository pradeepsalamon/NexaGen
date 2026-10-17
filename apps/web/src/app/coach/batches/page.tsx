import { CoachBatchesClient } from "../../../features/coach/components/CoachBatchesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/batches")
};

export default function CoachBatchesPage() {
  return <CoachBatchesClient />;
}
