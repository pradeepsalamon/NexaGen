import { cn } from "@/lib/utils";

/** `as="span"` (inline-block) where a div can't go, e.g. inside a `<p>` or a dialog description. */
function Skeleton({
  as: Tag = "div",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "span" }) {
  return (
    <Tag
      aria-hidden="true"
      className={cn(
        // A soft light sweep (GPU transform only) instead of a whole-block pulse.
        "relative isolate overflow-hidden rounded-control bg-app-text/[0.07]",
        Tag === "span" && "inline-block align-middle",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-app-text/[0.06] before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
