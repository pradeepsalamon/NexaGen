import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export type BatchSummaryFact = {
  icon: LucideIcon;
  key: string;
  label: ReactNode;
};

/**
 * The compact batch card used on the "My batches" pages (student and coach).
 *
 * Title + badges, a one-line description, the facts (dates, schedule, …) as
 * one wrapping row, and a footer whose left side holds people and whose right
 * side holds the actions — buttons always sit at the right edge.
 */
export function BatchSummaryCard({
  actions,
  badges,
  description,
  facts,
  people,
  testId,
  title
}: {
  actions?: ReactNode;
  badges?: ReactNode;
  description?: string | null;
  facts: BatchSummaryFact[];
  people?: ReactNode;
  testId?: string;
  title: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid={testId}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="min-w-0 break-words text-base font-semibold leading-snug text-app-text">{title}</h2>
          {badges}
        </div>
        {description ? <p className="mt-0.5 truncate text-sm text-app-muted">{description}</p> : null}
      </div>

      {facts.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-app-muted">
          {facts.map(({ icon: Icon, key, label }) => (
            <li className="flex min-w-0 items-center gap-1.5" key={key}>
              <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.25} />
              <span className="min-w-0 break-words">{label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {people || actions ? (
        <div className="mt-auto flex items-center gap-3 border-t border-app-border pt-3">
          <div className="min-w-0 flex-1">{people}</div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </Card>
  );
}
