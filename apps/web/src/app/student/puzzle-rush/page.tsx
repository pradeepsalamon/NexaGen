import { SoloRushClient } from "@/features/puzzle-rush-solo/components/SoloRushClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/puzzle-rush")
};

export default function StudentPuzzleRushPage() {
  return <SoloRushClient />;
}
