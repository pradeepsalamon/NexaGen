"use client";

import { History } from "lucide-react";
import type {
  LiveClassSettingsAuditEntry,
  LiveClassSettingsOverride,
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { SETTINGS_FIELDS, getAtPath, optionLabel } from "./fields";
import { useLiveClassSettingsAudit } from "./hooks";

const SCOPE_LABEL: Record<string, string> = {
  SYSTEM: "Platform",
  BATCH: "Batch",
  CLASS: "Class",
};

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Field-level diff between two override blobs, rendered with human labels. */
function changedFields(
  before: LiveClassSettingsOverride | null,
  after: LiveClassSettingsOverride | null,
) {
  const changes: { label: string; from: string; to: string }[] = [];
  for (const field of SETTINGS_FIELDS) {
    const b = getAtPath(before ?? {}, field.path);
    const a = getAtPath(after ?? {}, field.path);
    if (b === a) continue;
    changes.push({
      label: field.label,
      from: b ? optionLabel(field, b) : "Inherited",
      to: a ? optionLabel(field, a) : "Inherited",
    });
  }
  return changes;
}

function AuditRow({ entry }: { entry: LiveClassSettingsAuditEntry }) {
  const changes = changedFields(entry.before, entry.after);
  return (
    <li className="flex flex-col gap-2 border-b border-app-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className="py-0.5 text-[10px]">
          {SCOPE_LABEL[entry.scope] ?? entry.scope}
        </Badge>
        <span className="font-semibold text-app-text">
          {entry.entityName ?? "Platform defaults"}
        </span>
        <span className="text-app-muted">
          · {entry.actorName ?? "Unknown"} · {relativeTime(entry.createdAt)}
        </span>
      </div>
      {changes.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-app-muted">
          {changes.map((c) => (
            <li key={c.label}>
              <span className="text-app-text">{c.label}:</span> {c.from} → {c.to}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-app-muted">Settings updated.</p>
      )}
    </li>
  );
}

export function LiveClassAuditLog() {
  const { data, isLoading, isError, refetch } = useLiveClassSettingsAudit();

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <History className="size-5 text-primary" strokeWidth={2.5} />
        <h2 className="text-lg font-bold text-app-text">Recent changes</h2>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <WidgetError message="Couldn't load the change history." onRetry={() => refetch()} />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          title="No changes yet"
          description="Edits to platform defaults, batch defaults and class settings show up here."
        />
      ) : (
        <ul>
          {data.entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Card>
  );
}
