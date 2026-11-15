import { PlatformConsoleClient } from "@/features/platform/components/PlatformConsoleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/platform") };

export default function PlatformConsolePage() {
  return <PlatformConsoleClient />;
}
