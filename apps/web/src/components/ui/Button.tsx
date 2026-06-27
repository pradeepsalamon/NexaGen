import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className = "",
  disabled = false,
  fullWidth = false,
  isLoading = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      "border-transparent bg-primary text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-primary)_26%,transparent)]",
    secondary:
      "border-[color-mix(in_srgb,var(--color-secondary)_70%,var(--color-border))] bg-secondary text-app-text",
    ghost: "border-app-border bg-transparent text-app-text"
  };
  const classes = [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 text-sm font-bold transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0",
    variantClasses[variant],
    fullWidth ? "w-full" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-busy={isLoading || undefined}
      className={classes}
      disabled={disabled || isLoading}
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
}
