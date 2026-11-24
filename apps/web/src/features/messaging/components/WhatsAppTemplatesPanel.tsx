"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { API_ROUTES, type WhatsAppTemplateInfo, type WhatsAppTemplateListResponse } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { enumLabel } from "@/lib/utils";
import { WHATSAPP_TEMPLATE_STATUS_VARIANT, useWhatsAppTemplates } from "./WhatsAppTemplateStatus";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Approved", value: "APPROVED" },
  { label: "Pending", value: "PENDING" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Paused", value: "PAUSED" },
  { label: "Disabled", value: "DISABLED" }
];

function TemplateCard({ template }: { template: WhatsAppTemplateInfo }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-all font-mono text-sm font-semibold text-app-text">{template.name}</span>
        <Badge variant={WHATSAPP_TEMPLATE_STATUS_VARIANT[template.status] ?? "secondary"}>{enumLabel(template.status)}</Badge>
        {template.category ? <Badge variant="outline">{enumLabel(template.category)}</Badge> : null}
        <Badge variant="outline">{template.language}</Badge>
      </div>
      {template.header ? <p className="text-xs text-app-muted">Header: {enumLabel(template.header)}</p> : null}
      {template.body ? (
        <p className="whitespace-pre-wrap break-words rounded-app bg-app-soft p-3 text-sm text-app-text">{template.body}</p>
      ) : (
        <p className="text-sm text-app-muted">No body text.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
        <span>{template.paramCount === 0 ? "No values to fill" : `${template.paramCount} value${template.paramCount === 1 ? "" : "s"} to fill`}</span>
        {template.buttons.map((button) => (
          <Badge key={`${button.type}:${button.text}`} variant="secondary">
            {button.text}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

/**
 * Every template in the academy's connected WhatsApp account, as WhatsApp Manager has it
 * (docs/MESSAGING.md "WhatsApp templates"). Read-only: templates are made and approved there.
 */
export function WhatsAppTemplatesPanel() {
  const query = useWhatsAppTemplates();
  const queryClient = useQueryClient();
  const timeZone = useUserTimeZone();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await apiFetch<WhatsAppTemplateListResponse>(`${API_ROUTES.whatsappTemplates}?refresh=1`);
      queryClient.setQueryData(queryKeys.messaging.whatsappTemplates, fresh);
    } finally {
      setRefreshing(false);
    }
  };

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.templates ?? [])
      .filter((template) => (!status || template.status === status) && (!needle || `${template.name} ${template.body ?? ""}`.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
  }, [query.data, search, status]);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (query.isError) return <WidgetError message="Couldn't load WhatsApp templates." onRetry={() => void query.refetch()} />;
  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-app-muted">
          The templates in your connected WhatsApp account. Make and get them approved in WhatsApp Manager; pick one in a
          message rule or system message to reach people outside the 24-hour window.
          {data?.fetchedAt ? ` Read ${formatDateTime(data.fetchedAt, timeZone)}.` : ""}
        </p>
        <Button disabled={refreshing} onClick={() => void refresh()} variant="outline">
          <RotateCw aria-hidden className={refreshing ? "animate-spin" : undefined} strokeWidth={2.5} />
          Refresh
        </Button>
      </div>

      {!data?.available ? (
        <EmptyState description={data?.reason ?? "The WhatsApp account can't be read right now."} title="No WhatsApp account to read" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
            <Input aria-label="Search templates" onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or text" value={search} />
            <Select aria-label="Filter by status" onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} value={status} />
          </div>
          <p className="text-xs text-app-muted">
            {shown.length} of {data.templates.length} templates
          </p>
          {shown.length === 0 ? (
            <EmptyState
              description={data.templates.length === 0 ? "This account has no templates yet. Create them in WhatsApp Manager." : "No template matches."}
              title="No templates"
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {shown.map((template) => (
                <TemplateCard key={`${template.name}:${template.language}`} template={template} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
