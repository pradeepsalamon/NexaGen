"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
import { forwardRef } from "react";
import { Checkbox } from "@/components/ui/Checkbox";

const LINK = "font-medium text-primary-ink underline-offset-2 hover:underline";

/**
 * The Terms of Service + Privacy Policy checkbox on both registration forms.
 * The API refuses a sign-up without it and stores the version agreed to
 * (`LEGAL_TERMS_VERSION`); the documents open in a new tab so the form keeps
 * what was typed.
 */
export const TermsConsent = forwardRef<
  HTMLButtonElement,
  {
    checked: boolean;
    /** Shown after a submit attempt without the box ticked. */
    error?: string;
    id: string;
    onCheckedChange: (checked: boolean) => void;
  }
>(function TermsConsent({ checked, error, id, onCheckedChange }, ref) {
  const errorId = fieldErrorId(id);
  return (
    <div className="relative grid gap-1">
      <div className="flex items-start gap-2.5">
        <Checkbox
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          aria-required="true"
          checked={checked}
          className="mt-0.5"
          id={id}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          ref={ref}
        />
        <label className="cursor-pointer text-sm leading-5 text-app-muted" htmlFor={id}>
          I agree to the{" "}
          <Link className={LINK} href="/terms" rel="noopener" target="_blank">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link className={LINK} href="/privacy" rel="noopener" target="_blank">
            Privacy Policy
          </Link>
          .
          <span aria-hidden="true" className="ml-0.5 text-app-danger-ink">
            *
          </span>
        </label>
      </div>
      <FieldError className="pl-7" id={id} message={error} />
    </div>
  );
});

/** Under each registration form, like "Don't have an account?" under the login form. */
export function LoginPrompt({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-sm text-app-muted", className)}>
      Already have an account?{" "}
      <Link className="font-medium text-primary-ink hover:underline" href="/login">
        Log in
      </Link>
    </p>
  );
}

export const TERMS_REQUIRED_MESSAGE = "Accept the Terms of Service and Privacy Policy to continue.";
