import { CaptionTestClient } from "@/features/live-captions/components/CaptionTestClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/caption-test"),
};

export default function AdminCaptionTestPage() {
  return <CaptionTestClient />;
}
