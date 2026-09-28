"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, type InputProps } from "@/components/ui/Input";

type PasswordInputProps = Omit<InputProps, "type">;

export function PasswordInput({
  hasError = false,
  id,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const buttonLabel = isVisible ? "Hide password" : "Show password";
  const VisibilityIcon = isVisible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        className="pr-12"
        hasError={hasError}
        id={id}
        type={isVisible ? "text" : "password"}
        {...props}
      />
      <Button
        aria-controls={id}
        aria-label={buttonLabel}
        className="absolute right-1.5 top-1 inline-flex size-9 items-center justify-center rounded-full text-app-muted transition hover:bg-app-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
        onClick={() => setIsVisible((current) => !current)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <VisibilityIcon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      </Button>
    </div>
  );
}
