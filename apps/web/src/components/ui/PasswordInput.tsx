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
        className={compact ? "pr-8" : "pr-10"}
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
          "absolute top-1/2 -translate-y-1/2 text-app-subtle hover:bg-app-soft hover:text-app-text",
          compact ? "right-0.5 size-7" : "right-0.5 size-8"
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
