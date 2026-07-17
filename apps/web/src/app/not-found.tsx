import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center p-8 text-center bg-app-background text-app-text">
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center space-y-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-app-surface text-app-muted border border-app-border">
          <FileQuestion className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Page not found</h2>
          <p className="text-app-muted">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>
        <div className="pt-4">
          <Button asChild>
            <Link href="/">Return Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
