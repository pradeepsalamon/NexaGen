import { DemoClassesClient } from "../../../features/admin/components/DemoClassesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/demo-classes") };

export default function AdminDemoClassesPage() {
  return <DemoClassesClient />;
}
