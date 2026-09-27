import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1 rounded-full border px-3 text-xs font-semibold leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/40 bg-primary/10 text-primary-ink",
        secondary: "border-app-border bg-app-soft text-app-text",
        success: "border-success/40 bg-success/10 text-success-ink",
        warning: "border-warning/40 bg-warning/10 text-warning-ink",
        info: "border-info/40 bg-info/10 text-info-ink",
        destructive: "border-app-danger/40 bg-app-danger/10 text-app-danger-ink",
        outline: "border-app-border bg-transparent text-app-muted"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
