import { Suspense } from "react";
import { UnsubscribeClient } from "@/features/email-preferences/components/UnsubscribeClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { robots: { index: false }, title: pageTitle("/unsubscribe") };

export default function UnsubscribePage() {
  return (
    // useSearchParams (the token) needs a Suspense boundary to prerender.
    <Suspense fallback={null}>
      <UnsubscribeClient />
    </Suspense>
  );
}
