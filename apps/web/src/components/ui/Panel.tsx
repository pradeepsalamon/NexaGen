import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

type PanelProps = {
  children: ReactNode;
  className?: string;
  testId?: string;
};

export function Panel({ children, className, testId }: PanelProps) {
  return (
    <section
      className={cn(
        "group/panel overflow-hidden rounded-panel border border-app-border bg-app-surface shadow-card",
        "transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

type PanelHeaderProps = {
  actions?: ReactNode;
  description?: string;
  icon: LucideIcon;
  title: string;
  tone: Tone;
};

export function PanelHeader({
  actions,
  description,
  icon: Icon,
  title,
  tone
}: PanelHeaderProps) {
  const style = TONE[tone];

  return (
    <header
      className={cn(
        "relative flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-5 py-4",
        style.header
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-x-0 top-0 h-[3px]", style.bar)}
      />
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-control transition-transform duration-300 group-hover/panel:scale-105",
            style.chip
          )}
        >
          <Icon className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold tracking-tight text-app-text">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 truncate text-xs text-app-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/** Divided list used by every panel that renders rows. */
export function PanelList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-app-border">{children}</ul>;
}

export function PanelRow({
  children,
  className,
  testId,
  tone
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  tone: Tone;
}) {
  return (
    <li
      className={cn(
        "flex flex-col justify-between gap-4 px-5 py-4 transition-colors duration-200",
        TONE[tone].hover,
        className
      )}
      data-testid={testId}
    >
      {children}
    </li>
  );
}

type PanelEmptyProps = {
  action?: ReactNode;
  icon: LucideIcon;
  message: string;
  title: string;
  tone: Tone;
};

export function PanelEmpty({ action, icon: Icon, message, title, tone }: PanelEmptyProps) {
  const style = TONE[tone];

  return (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-16 items-center justify-center rounded-full",
          style.chip
        )}
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 border-dashed opacity-60",
            style.border
          )}
        />
        <Icon className="size-7" strokeWidth={2.5} />
      </span>
      <p className="mt-4 font-extrabold text-app-text">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-app-muted">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
