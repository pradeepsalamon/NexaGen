import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <main
      aria-label="Loading"
      className="grid min-h-screen place-items-center bg-app-background px-4"
    >
      <Spinner
        aria-hidden="true"
        className="size-9 text-primary-ink"
      />
    </main>
  );
}
