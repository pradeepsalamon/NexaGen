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
        "inline-flex items-center rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold text-yellow-950 shadow-sm transition-all hover:bg-yellow-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 w-fit",
        className
      )}
      {...props}
    >
      <ChevronLeft className="mr-1.5 h-4 w-4" />
      {label}
    </button>
  );
}
