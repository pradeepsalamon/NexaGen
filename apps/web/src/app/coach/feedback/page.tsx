import { CoachFeedbackClient } from "@/features/feedback/components/CoachFeedbackClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/feedback") };

export default function CoachFeedbackPage() {
  return <CoachFeedbackClient />;
}
