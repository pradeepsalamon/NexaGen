"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center bg-app-background p-8 text-center text-app-text">
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
          <FileQuestion aria-hidden="true" className="size-7" strokeWidth={2.25} />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Page not found</h1>
          <p className="text-app-muted">The page you are looking for does not exist or has been moved.</p>
        </div>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button variant="neutral" onClick={() => router.back()}>
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Go back
          </Button>
          <Button asChild>
            <Link href="/">Return home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
