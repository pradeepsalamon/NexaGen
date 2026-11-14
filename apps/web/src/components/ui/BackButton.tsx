"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

interface BackButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label?: string;
  /** Where to go when there is no history to return to (a link opened in a new tab). */
  fallbackHref?: string;
}

export function BackButton({
  label = "Back",
  fallbackHref,
  className,
  ...props
}: BackButtonProps) {
  const router = useRouter();

  const goBack = () => {
    if (fallbackHref && window.history.length <= 1) {
      router.push(fallbackHref);
      return;
    }
    router.back();
  };

  return (
    <Button
      className={cn("w-fit gap-1.5 px-4", className)}
      onClick={goBack}
      size="sm"
      variant="secondary"
      {...props}
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
