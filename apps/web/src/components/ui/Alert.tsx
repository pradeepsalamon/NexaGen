import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-start gap-3 rounded-[14px] border p-3.5 text-sm leading-6",
  {
    variants: {
      variant: {
        error: "border-app-danger/30 bg-app-danger/[0.06] text-app-danger-ink",
        info: "border-primary/25 bg-primary/[0.06] text-app-text",
        success: "border-success/30 bg-success/[0.07] text-success-ink",
        warning: "border-warning/35 bg-warning/[0.08] text-warning-ink"
      }
    },
    defaultVariants: {
      variant: "info"
    }
  }
);

const ICONS: Record<NonNullable<AlertProps["variant"]>, LucideIcon> = {
  error: XCircle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle
};

type AlertProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> &
  VariantProps<typeof alertVariants> & {
    /** Trailing slot, e.g. a Retry button. */
    action?: ReactNode;
    title?: ReactNode;
  };

/** Tinted inline message. Errors announce assertively; everything else politely. */
function Alert({ action, children, className, title, variant, ...props }: AlertProps) {
  const tone = variant ?? "info";
  const Icon = ICONS[tone];

  return (
    <div
      aria-atomic="true"
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(alertVariants({ variant: tone }), className)}
      role={tone === "error" ? "alert" : "status"}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export { Alert, alertVariants };
