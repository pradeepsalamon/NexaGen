import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

export type QuickAction = {
  description?: string;
  href: string;
  icon: LucideIcon;
  label: string;
  /** The hue's meaning comes from `lib/tone.ts` (classes blue, practice amber …). */
  tone: Tone;
};

/**
 * A dashboard's shortcuts: tinted tiles with an icon chip, two per row on
 * phones and four from `lg`. Links only — each opens the page that does the work.
 */
export function QuickActionGrid({ actions, className }: { actions: QuickAction[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {actions.map(({ description, href, icon: Icon, label, tone }) => {
        const style = TONE[tone];
        return (
          <li key={href}>
            <Link
              className={cn(
                "group flex h-full flex-col gap-3 rounded-app border p-3 font-normal text-app-text transition-[transform,box-shadow,border-color] hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus motion-safe:hover:-translate-y-0.5 sm:p-4",
                style.border,
                style.wash
              )}
              href={href}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-10 items-center justify-center rounded-control transition-transform motion-safe:group-hover:scale-105",
                  style.chip
                )}
              >
                <Icon className="size-5" strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                {description ? (
                  <span className="mt-0.5 block text-xs text-app-muted">{description}</span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
