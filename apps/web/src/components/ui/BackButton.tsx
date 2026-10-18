"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "../../lib/utils";

interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function BackButton({ 
  label = "Back", 
  className,
  ...props 
}: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={cn(
        "inline-flex w-fit items-center rounded-full bg-secondary px-4 py-2 text-sm font-bold text-black shadow-card transition hover:bg-[color-mix(in_srgb,var(--color-secondary)_84%,white)] hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
        className
      )}
      {...props}
    >
      <ChevronLeft className="mr-1.5 h-4 w-4" />
      {label}
    </button>
  );
}
