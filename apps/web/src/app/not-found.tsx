"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FileQuestion, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-[calc(100dvh-200px)] flex-col items-center justify-center p-8 text-center bg-app-background text-app-text">
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
        <div className="pt-4 flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button asChild>
            <Link href="/">Return Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
