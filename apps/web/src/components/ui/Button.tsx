import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

type ButtonVariant =
  | "destructive"
  | "ghost"
  | "outline"
  | "primary"
  | "secondary";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  destructive:
    "border-transparent bg-app-danger text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-danger)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,black)]",
  ghost:
    "border-transparent bg-transparent text-app-text hover:bg-app-soft hover:text-app-text",
  outline:
    "border-app-border bg-app-surface text-app-text shadow-card hover:bg-app-soft",
  primary:
    "border-transparent bg-primary text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-primary)_26%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)]",
  secondary:
    "border-[color-mix(in_srgb,var(--color-secondary)_70%,var(--color-border))] bg-secondary text-app-text shadow-card hover:bg-[color-mix(in_srgb,var(--color-secondary)_84%,white)]"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-11 px-4 py-2",
  icon: "size-10 p-0",
  lg: "min-h-12 px-6 py-2.5",
  sm: "min-h-9 px-3 py-1.5"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled = false,
    fullWidth = false,
    isLoading = false,
    size = "default",
    type = "button",
    variant = "primary",
    ...props
  },
  ref
) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      aria-busy={isLoading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border text-sm font-bold transition disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      disabled={isDisabled}
      ref={ref}
      type={type}
      {...props}
    >
      {isLoading ? (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin"
          strokeWidth={2.5}
        />
      ) : null}
      {children}
    </button>
  );
});
