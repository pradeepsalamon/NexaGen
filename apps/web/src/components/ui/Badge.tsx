import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        accent: "bg-accent-soft text-accent-ink",
        default: "bg-primary-soft text-primary-ink",
        destructive: "bg-app-danger-soft text-app-danger-ink",
        info: "bg-info-soft text-info-ink",
        live: "border border-app-danger bg-app-surface text-app-danger-ink",
        outline: "border border-app-border bg-transparent text-app-muted",
        secondary: "bg-app-soft text-app-muted",
        success: "bg-success-soft text-success-ink",
        warning: "bg-warning-soft text-warning-ink"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

// A span, so a badge is valid inside a <p>, a button or a table cell's text.
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
