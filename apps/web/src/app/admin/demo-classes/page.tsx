import { DemoClassesClient } from "../../../features/admin/components/DemoClassesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/demo-classes") };

export default function AdminDemoClassesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <DemoClassesClient />
    </div>
  );
}
