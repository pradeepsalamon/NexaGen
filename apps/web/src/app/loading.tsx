import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main
      aria-label="Loading"
      className="grid min-h-screen place-items-center bg-app-background px-4"
    >
      <Loader2
        aria-hidden="true"
        className="size-9 animate-spin text-primary"
        strokeWidth={2.5}
      />
    </main>
  );
}
