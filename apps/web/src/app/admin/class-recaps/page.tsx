import { ClassRecapsClient } from "@/features/class-recap/components/ClassRecapsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/class-recaps") };

export default function AdminClassRecapsPage() {
  return <ClassRecapsClient scope="admin" />;
}
