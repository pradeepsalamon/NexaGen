import { CoachPresetsClient } from "@/features/live-class/settings/CoachPresetsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/presets"),
};

export default function CoachPresetsPage() {
  return <CoachPresetsClient />;
}
