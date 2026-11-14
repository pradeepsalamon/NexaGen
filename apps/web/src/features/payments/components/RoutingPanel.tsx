"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  isMethodEnabled,
  methodNote,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PROVIDER_LABELS,
  resolvePaymentProvider,
  type PaymentMethodKind,
  type PaymentRoutingConfig
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRouting, useSaveRouting } from "../hooks/usePaymentsApi";
import { Switch } from "@/components/ui/Switch";

/**
 * Smart-routing configuration (§3).
 *
 * The preview below runs `resolvePaymentProvider` — the *same* pure function
 * the API uses to pick a gateway. There is no second implementation, so what an
 * admin sees here is exactly what a checkout would do.
 */
export function RoutingPanel() {
  const { data, isLoading } = useRouting();
  const save = useSaveRouting();

  const [draft, setDraft] = useState<PaymentRoutingConfig | null>(null);
  const [previewCurrency, setPreviewCurrency] = useState("INR");

  useEffect(() => {
    if (data && !draft) setDraft(data.config);
  }, [data, draft]);

  if (isLoading || !draft || !data) return <Skeleton className="h-80 w-full" />;

  const unavailable = Object.entries(data.configured)
    .filter(([, configured]) => !configured)
    .map(([provider]) => provider as keyof typeof PAYMENT_PROVIDER_LABELS);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-bold text-app-text">Routing rules</h3>
        <p className="mt-1 text-sm text-app-muted">
          The first matching rule wins. Its first gateway is the primary; the
          rest are fallbacks, used only after the original attempt has been
          reconciled.
        </p>

        <ul className="mt-4 space-y-2">
          {draft.rules.map((rule, index) => (
            <li
              className="flex flex-wrap items-center gap-3 rounded-app border border-app-border p-3"
              key={rule.id}
            >
              <label className="flex items-center gap-2 text-sm font-semibold text-app-text">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      rules: draft.rules.map((current, position) =>
                        position === index
                          ? { ...current, enabled: checked === true }
                          : current
                      )
                    })
                  }
                />
                {rule.label}
              </label>

              <span className="text-xs text-app-muted">
                {rule.currencies.length > 0
                  ? rule.currencies.join(", ")
                  : "Any currency"}
                {" · "}
                {rule.methods.length > 0
                  ? rule.methods
                      .map((method) => PAYMENT_METHOD_LABELS[method])
                      .join(", ")
                  : "Any method"}
              </span>

              <span className="ml-auto flex items-center gap-1.5">
                {rule.providers.map((provider, position) => (
                  <span className="flex items-center gap-1.5" key={provider}>
                    {position > 0 ? (
                      <ArrowRight
                        aria-hidden
                        className="size-3 text-app-muted"
                        strokeWidth={2.5}
                      />
                    ) : null}
                    <Badge
                      variant={
                        data.configured[provider] ? "default" : "outline"
                      }
                    >
                      {PAYMENT_PROVIDER_LABELS[provider]}
                    </Badge>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <Switch
            checked={draft.failoverEnabled}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, failoverEnabled: checked === true })
            }
          />
          <span>
            Allow automatic failover to the next gateway
            <span className="block text-xs text-app-muted">
              Only ever applies to a NEW attempt on an order whose previous
              attempt has been reconciled — never while it is unclear whether
              the customer was debited.
            </span>
          </span>
        </label>

        {unavailable.length > 0 ? (
          <p className="mt-3 rounded-app bg-app-soft px-3 py-2 text-xs text-app-muted">
            Not configured on this environment:{" "}
            {unavailable
              .map((provider) => PAYMENT_PROVIDER_LABELS[provider])
              .join(", ")}
            . Rules naming them are skipped at checkout.
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button
            disabled={save.isPending}
            isLoading={save.isPending}
            onClick={() => save.mutate(draft)}
            type="button"
            variant="primary"
          >
            Save routing
          </Button>
          <Button
            onClick={() => setDraft(data.config)}
            type="button"
            variant="outline"
          >
            Reset
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-app-text">Payment methods</h3>
        <p className="mt-1 text-sm text-app-muted">
          Turn a method off to remove it from every checkout at once. The wording
          replaces the default line shown under it.
        </p>

        <ul className="mt-4 space-y-2">
          {PAYMENT_METHOD_KINDS.filter((method) => method !== "OTHER").map(
            (method) => {
              const enabled = isMethodEnabled(draft, method);
              return (
                <li
                  className="flex flex-wrap items-center gap-3 rounded-app border border-app-border p-3"
                  key={method}
                >
                  <label className="flex min-w-36 items-center gap-2 text-sm font-semibold text-app-text">
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        setDraft({
                          ...draft,
                          methodSettings: {
                            ...draft.methodSettings,
                            [method]: {
                              ...(draft.methodSettings[method] ?? {}),
                              enabled: checked === true
                            }
                          }
                        })
                      }
                    />
                    {PAYMENT_METHOD_LABELS[method]}
                  </label>

                  <div className="min-w-48 flex-1">
                    <SimpleTooltip label="Shown under this method on the checkout screen">
                      <Input
                        aria-label={`Checkout wording for ${PAYMENT_METHOD_LABELS[method]}`}
                        disabled={!enabled}
                        maxLength={160}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            methodSettings: {
                              ...draft.methodSettings,
                              [method]: {
                                enabled,
                                note: event.target.value || undefined
                              }
                            }
                          })
                        }
                        placeholder={methodNote(draft, method)}
                        value={draft.methodSettings[method]?.note ?? ""}
                      />
                    </SimpleTooltip>
                  </div>
                </li>
              );
            }
          )}
        </ul>

        <p className="mt-3 rounded-app bg-app-soft px-3 py-2 text-xs text-app-muted">
          A method-specific <em>offer</em> — 10% off on UPI, say — is a discount
          code with that method ticked, not a setting here. That keeps every
          change to what someone pays in one auditable place.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-app-text">Preview</h3>
        <p className="mt-1 text-sm text-app-muted">
          What a checkout would choose right now, using the unsaved rules above.
        </p>

        <div className="mt-3 max-w-[200px]">
          <Label htmlFor="preview-currency">Currency</Label>
          <Input
            id="preview-currency"
            maxLength={3}
            onChange={(event) =>
              setPreviewCurrency(event.target.value.toUpperCase())
            }
            value={previewCurrency}
          />
        </div>

        <ul className="mt-4 space-y-1.5 text-sm">
          {PAYMENT_METHOD_KINDS.map((method) => (
            <PreviewRow
              config={draft}
              currency={previewCurrency}
              key={method}
              method={method}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PreviewRow({
  config,
  currency,
  method
}: {
  config: PaymentRoutingConfig;
  currency: string;
  method: PaymentMethodKind;
}) {
  const decision = resolvePaymentProvider(config, { currency, method });

  return (
    <li className="flex items-center justify-between gap-3 border-b border-app-border py-1.5 last:border-b-0">
      <span className="text-app-text">{PAYMENT_METHOD_LABELS[method]}</span>
      <span className="flex items-center gap-1.5">
        {decision ? (
          <>
            <Badge variant="default">
              {PAYMENT_PROVIDER_LABELS[decision.provider]}
            </Badge>
            {decision.fallbacks.map((provider) => (
              <Badge key={provider} variant="outline">
                then {PAYMENT_PROVIDER_LABELS[provider]}
              </Badge>
            ))}
          </>
        ) : (
          <span className="text-xs text-app-muted">Not offered</span>
        )}
      </span>
    </li>
  );
}
