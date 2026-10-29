"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, type InputProps } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<InputProps, "type">;

export function PasswordInput({
  density = "default",
  hasError = false,
  id,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const buttonLabel = isVisible ? "Hide password" : "Show password";
  const VisibilityIcon = isVisible ? EyeOff : Eye;
  const compact = density === "compact";

  return (
    <div className="relative">
      <Input
        className={compact ? "pr-9" : "pr-12"}
        density={density}
        hasError={hasError}
        id={id}
        type={isVisible ? "text" : "password"}
        {...props}
      />
      <Button
        aria-controls={id}
        aria-label={buttonLabel}
        className={cn(
          "absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full text-nx-muted transition hover:bg-nx-hover hover:text-nx-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
          compact ? "right-1 size-7 min-h-0" : "right-1.5 size-9"
        )}
        onClick={() => setIsVisible((current) => !current)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <VisibilityIcon aria-hidden="true" className={compact ? "size-3.5" : "size-4"} strokeWidth={2.5} />
      </Button>
    </div>
  );
}
