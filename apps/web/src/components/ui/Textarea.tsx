import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./fieldStyles";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  hasError?: boolean;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, hasError: hasErrorProp = false, ...props }, ref) {
    // FormField marks its control aria-invalid when it has an error: show the error border too.
    const hasError = hasErrorProp || props["aria-invalid"] === true || props["aria-invalid"] === "true";
    return (
      <textarea
        aria-invalid={hasError}
        className={cn(
          "min-h-24 w-full resize-y px-3 py-2",
          fieldClasses({ hasError }),
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

