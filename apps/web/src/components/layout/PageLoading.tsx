import { Skeleton } from "@/components/ui/Skeleton";

// Content-area placeholder for route loading.tsx files inside AppShell.
export function PageLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6" role="status">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton className="h-24 rounded-panel" key={i} />
        ))}
      </div>
      <Skeleton className="h-72 rounded-panel" />
    </div>
  );
}
