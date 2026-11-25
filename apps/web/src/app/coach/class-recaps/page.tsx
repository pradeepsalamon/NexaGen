import { ClassRecapsClient } from "@/features/class-recap/components/ClassRecapsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/class-recaps") };

export default function CoachClassRecapsPage() {
  return <ClassRecapsClient scope="coach" />;
}
