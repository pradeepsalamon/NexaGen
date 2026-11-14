import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /**
   * The page's `TabsList` (render the header inside its `<Tabs>`). It sits beside the title
   * when there is room and drops to its own right-aligned row when there isn't, so a long
   * strip stays a strip instead of collapsing into its menu.
   */
  tabs?: ReactNode;
  /** Where this page sits, for detail pages. The last crumb is the current page. */
  breadcrumbs?: Crumb[];
  children?: ReactNode; // For tabs or other lower content
};

export function PageHeader({ title, description, actions, breadcrumbs, children, tabs }: PageHeaderProps) {
  return (
    // Inside a `<Tabs>` grid (which adds its own gap) the header needs less room below it.
    <div className={cn("flex flex-col gap-4", tabs ? "mb-2" : "mb-6")}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
          tabs ? "sm:flex-wrap" : null
        )}
      >
        <div className={cn("min-w-0", tabs ? "sm:flex-1 sm:basis-72" : null)}>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-app-muted">
              {description}
            </p>
          )}
        </div>
        {tabs ? (
          // As wide as the strip needs (up to the whole row): beside the title, or wrapped below it.
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:ml-auto sm:max-w-full sm:flex-none">
            {tabs}
            {actions}
          </div>
        ) : actions ? (
          // Never squeezed below its buttons by a long description: up to 60% of the row, wrapping inside it.
          <div className="flex flex-wrap items-center justify-end gap-2 sm:max-w-[60%] sm:flex-none">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
