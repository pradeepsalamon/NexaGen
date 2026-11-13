import { AppShell } from "@/components/layout/AppShell";
import { PageContent } from "@/components/layout/PageContent";
import { PageLoading } from "@/components/layout/PageLoading";

/**
 * Route `loading.tsx` for pages that mount `AppShell` themselves. Without one they fall back to
 * the root full-screen spinner, and the docked nav disappears while the page loads.
 */
export function ShellPageLoading() {
  return (
    <AppShell>
      <PageContent>
        <PageLoading />
      </PageContent>
    </AppShell>
  );
}
