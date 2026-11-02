import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border text-sm font-medium transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-soft disabled:text-app-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
  {
    variants: {
      variant: {
        "danger-soft":
          "border-transparent bg-app-danger-soft text-app-danger-ink hover:bg-app-danger/20",
        destructive:
          "border-transparent bg-app-danger text-on-danger hover:bg-app-danger-hover",
        ghost:
          "border-transparent bg-transparent text-primary-ink hover:bg-primary-soft disabled:border-transparent disabled:bg-transparent",
        neutral:
          "border-app-line-strong bg-app-surface text-app-text hover:bg-app-soft",
        outline:
          "border-primary bg-app-surface text-primary-ink hover:bg-primary-soft",
        primary:
          "border-transparent bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-dark",
        secondary:
          "border-transparent bg-accent text-on-accent hover:bg-accent-hover"
      },
      size: {
        default: "min-h-[var(--control-h)] px-4 py-1.5",
        icon: "size-[var(--control-h)] p-0",
        lg: "min-h-[var(--control-h-lg)] px-6 py-2",
        sm: "min-h-[var(--control-h-sm)] px-3 py-1"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    children: ReactNode;
    fullWidth?: boolean;
    isLoading?: boolean;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    asChild = false,
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
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      aria-busy={isLoading || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        fullWidth && "w-full",
        className
      )}
      disabled={isDisabled}
      ref={ref}
      type={type}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {isLoading ? (
            <Loader2
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin"
              strokeWidth={2.5}
            />
          ) : null}
          {children}
        </>
      )}
    </Comp>
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
