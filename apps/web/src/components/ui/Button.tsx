import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border text-sm font-bold transition disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
  {
    variants: {
      variant: {
        destructive:
          "border-transparent bg-app-danger text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--color-danger)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,black)]",
        ghost:
          "border-transparent bg-transparent text-app-text hover:bg-app-soft hover:text-app-text",
        outline:
          "border-primary bg-app-surface text-primary hover:bg-primary/5 dark:border-app-text dark:text-app-text dark:hover:bg-white/5",
        primary:
          "border-transparent bg-[color-mix(in_srgb,var(--color-primary)_96%,white)] text-white shadow-[0_2px_6px_-1px_color-mix(in_srgb,var(--color-primary)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,white)]",
        secondary:
          "border-[color-mix(in_srgb,var(--color-secondary)_70%,var(--color-border))] bg-secondary text-black shadow-card hover:bg-[color-mix(in_srgb,var(--color-secondary)_84%,white)]"
      },
      size: {
        default: "min-h-11 px-4 py-2",
        icon: "size-10 p-0",
        lg: "min-h-12 px-6 py-2.5",
        sm: "min-h-9 px-3 py-1.5"
      }
    },
    // The pressed-key bottom edge only on text buttons; icon buttons stay evenly bordered.
    compoundVariants: [
      { class: "border-b-2", size: ["default", "lg", "sm"], variant: "outline" }
    ],
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
