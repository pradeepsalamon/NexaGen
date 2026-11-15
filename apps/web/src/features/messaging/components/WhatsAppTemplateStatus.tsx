"use client";

import { useQuery } from "@tanstack/react-query";
import { API_ROUTES, checkWhatsAppTemplate, type WhatsAppTemplateListResponse } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { enumLabel } from "@/lib/utils";

/** The academy's templates from WhatsApp Manager (the API caches them for 5 minutes). */
export function useWhatsAppTemplates(enabled = true) {
  return useQuery({
    enabled,
    queryFn: () => apiFetch<WhatsAppTemplateListResponse>(API_ROUTES.whatsappTemplates),
    queryKey: queryKeys.messaging.whatsappTemplates,
    staleTime: 5 * 60_000
  });
}

const STATUS_VARIANT: Record<string, "destructive" | "success" | "warning"> = {
  APPROVED: "success",
  DISABLED: "destructive",
  PAUSED: "warning",
  PENDING: "warning",
  REJECTED: "destructive"
};

/**
 * What WhatsApp Manager says about a template name + language typed into a
 * form: approved, pending, rejected, only in another language, or not there.
 * Nothing when the name is empty or the account can't be read (the reason is
 * shown once, quietly).
 */
export function WhatsAppTemplateStatus({ language, name }: { language: string; name: string }) {
  const trimmed = name.trim();
  const query = useWhatsAppTemplates(trimmed.length > 0);
  if (!trimmed || !query.data) return null;
  if (!query.data.available) {
    return <p className="text-xs text-app-muted">{query.data.reason}</p>;
  }
  const check = checkWhatsAppTemplate(query.data.templates, trimmed, language);
  if (check.kind === "found") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
        <Badge variant={STATUS_VARIANT[check.status] ?? "secondary"}>{enumLabel(check.status)}</Badge>
        <span>in WhatsApp Manager{check.category ? ` · ${enumLabel(check.category)}` : ""}</span>
      </div>
    );
  }
  return (
    <p className="text-xs text-warning-ink">
      {check.kind === "other-language"
        ? `This template exists only in ${check.languages.join(", ")}. Use one of those language codes.`
        : "No template with this name in WhatsApp Manager. Check the spelling, or create it there first."}
    </p>
  );
}
