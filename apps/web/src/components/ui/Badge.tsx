import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/[0.12] text-primary-ink",
        secondary: "bg-app-soft text-app-text",
        success: "bg-accent/30 text-accent-ink",
        warning: "bg-secondary/30 text-secondary-ink",
        info: "bg-warm/30 text-warm-ink",
        destructive: "bg-app-danger/[0.12] text-app-danger-ink",
        outline: "border border-app-border text-app-muted"
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
