import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Where this page sits, for detail pages. The last crumb is the current page. */
  breadcrumbs?: Crumb[];
  children?: ReactNode; // For tabs or other lower content
};

export function PageHeader({ title, description, actions, breadcrumbs, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-app-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
