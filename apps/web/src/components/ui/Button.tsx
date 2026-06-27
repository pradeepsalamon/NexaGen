import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className = "",
  fullWidth = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      "border-transparent bg-primary text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-primary)_26%,transparent)]",
    secondary:
      "border-[color-mix(in_srgb,var(--color-primary)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))] text-app-text",
    ghost: "border-app-border bg-transparent text-app-text"
  };
  const classes = [
    "inline-flex min-h-11 items-center justify-center rounded-control border px-4 text-sm font-bold transition hover:-translate-y-0.5 active:translate-y-0",
    variantClasses[variant],
    fullWidth ? "w-full" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}
