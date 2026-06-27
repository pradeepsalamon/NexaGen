"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { Input } from "./Input";

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

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
      <button
        aria-controls={id}
        aria-label={buttonLabel}
        className="absolute right-1.5 top-1 inline-flex size-9 items-center justify-center rounded-control text-primary transition hover:bg-primary/10"
        onClick={() => setIsVisible((current) => !current)}
        type="button"
      >
        <VisibilityIcon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
