import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        // A soft light sweep (GPU transform only) instead of a whole-block pulse.
        "relative isolate overflow-hidden rounded-control bg-app-text/[0.07]",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-app-text/[0.06] before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
