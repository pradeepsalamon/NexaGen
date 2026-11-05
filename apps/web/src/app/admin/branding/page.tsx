import { BrandingClient } from "@/features/branding/components/BrandingClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/branding") };

export default function AdminBrandingPage() {
  return <BrandingClient />;
}
