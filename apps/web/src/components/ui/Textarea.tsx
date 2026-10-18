import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  hasError?: boolean;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, hasError = false, ...props }, ref) {
    return (
      <textarea
        aria-invalid={hasError}
        className={cn(
          "min-h-24 w-full resize-y rounded-[20px] border bg-app-surface px-4 py-3 text-sm text-app-text shadow-[inset_0_1px_2px_rgb(var(--rgb-text)/0.06)] transition placeholder:text-app-muted/70 hover:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] focus:outline-none",
          hasError ? "border-app-danger" : "border-app-border",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

