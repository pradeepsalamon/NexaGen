import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type Crumb = {
  label: string;
  /** Leave out on the current page. */
  href?: string;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-app-muted">
        {items.map((item, index) => (
          <li className="flex min-w-0 items-center gap-1" key={item.href ?? item.label}>
            {index > 0 ? <ChevronRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.25} /> : null}
            {item.href ? (
              <Link className="truncate font-medium text-app-muted hover:text-app-text hover:underline" href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-app-text">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
