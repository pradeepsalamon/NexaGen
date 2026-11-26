"use client";

import { useMemo, useState } from "react";
import {
  AI_PROVIDERS,
  sameAiModel,
  type AiFeatureView,
  type AiModelRef,
  type AiProviderId,
  type AiProviderModelsResponse,
  type AiProviderView,
  type AiRouteModel,
  type TestAiModelResponse
} from "@nexa-chess/types";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/Combobox";
import { FormField } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  useAiIntegrations,
  useAiProviderModels,
  useRefreshAiModels,
  useRemoveAiProvider,
  useTestAiModel,
  useUpdateAiFeature,
  useUpdateAiProvider
} from "../hooks/useAiProviders";

const AUTO_ITEM = "Auto (best connected model)";
const NO_FALLBACK_ITEM = "No fallback";

const modelLabel = (ref: AiModelRef) => `${AI_PROVIDERS[ref.provider].label} · ${ref.model}`;

function routeLabel(model: AiRouteModel | null, none: string) {
  if (!model) return none;
  return `${modelLabel(model)}${model.auto ? " (Auto)" : ""}`;
}

// ── Providers ───────────────────────────────────────────────

function ProviderForm({ models, provider }: { provider: AiProviderView; models: AiProviderModelsResponse | undefined }) {
  const timeZone = useUserTimeZone();
  const save = useUpdateAiProvider();
  const remove = useRemoveAiProvider();
  const refresh = useRefreshAiModels();
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(provider.keyHint ? provider.enabled : true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const id = `ai-${provider.provider.toLowerCase()}`;
  const hasKey = provider.keyHint !== null;
  const changed = apiKey.trim().length > 0 || (hasKey && enabled !== provider.enabled);
  const freeCount = models?.models.filter((m) => m.free === true).length ?? 0;

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save
          .mutateAsync({ body: { apiKey: apiKey.trim() || undefined, enabled }, provider: provider.provider })
          .then(() => setApiKey(""), () => undefined);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-app-text">{provider.label}</h3>
        <Badge variant={provider.connected ? "success" : hasKey ? "warning" : "secondary"}>
          {provider.connected ? "Connected" : hasKey ? "Switched off" : "Not connected"}
        </Badge>
        {provider.keyHint ? <span className="text-xs text-app-muted">Key ending in {provider.keyHint}</span> : null}
        {provider.updatedAt ? <span className="text-xs text-app-muted">· saved {formatDateTime(provider.updatedAt, timeZone)}</span> : null}
      </div>
      <div className="grid gap-1 text-xs text-app-muted">
        <p>
          <span className="font-semibold text-app-text">Free tier:</span> {provider.freeTier}
        </p>
        <p>
          <span className="font-semibold text-app-text">What it may do with what we send:</span> {provider.dataUse}
        </p>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <FormField hint={hasKey ? "Saved. Leave blank to keep it." : "The key is checked with the provider before it is saved."} id={`${id}-key`} label="API key">
          <PasswordInput
            autoComplete="off"
            disabled={save.isPending}
            id={`${id}-key`}
            onChange={(event) => setApiKey(event.target.value)}
            value={apiKey}
          />
        </FormField>
        <a
          className="inline-flex min-h-[var(--control-h)] items-center gap-1 text-sm font-semibold text-primary-ink underline-offset-2 hover:underline"
          href={provider.keysUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Get a key
          <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        </a>
      </div>
      {/* A save re-mounts this form with the stored values, so nothing is typed while it runs. */}
      <Switch checked={enabled} disabled={save.isPending} id={`${id}-enabled`} label="Use this provider" onCheckedChange={setEnabled} />
      {provider.connected ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
          {models ? (
            <span>
              {models.models.length} chat models offered{provider.provider === "OPENROUTER" ? `, ${freeCount} free` : ""}.
            </span>
          ) : (
            <span>Loading the model list…</span>
          )}
          <SimpleTooltip label="Fetch the model list again">
            <Button
              aria-label={`Fetch ${provider.label}'s model list again`}
              className="size-8"
              isLoading={refresh.isPending}
              onClick={() => refresh.mutate(provider.provider)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!changed || (!hasKey && apiKey.trim().length < 8)} isLoading={save.isPending} type="submit" variant="outline">
          {hasKey ? `Save ${provider.label}` : `Connect ${provider.label}`}
        </Button>
        {hasKey ? (
          <Button onClick={() => setConfirmRemove(true)} type="button" variant="ghost">
            Remove key
          </Button>
        ) : null}
      </div>
      <AlertDialog onOpenChange={setConfirmRemove} open={confirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {provider.label} key?</AlertDialogTitle>
            <AlertDialogDescription>
              Features using {provider.label} move to their fallback, or to the next Auto model of a provider still connected. The key is
              deleted from the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate(provider.provider)}>Remove key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

// ── Features ────────────────────────────────────────────────

type ModelOptions = { items: string[]; byItem: Map<string, AiModelRef> };

function useModelOptions(lists: (AiProviderModelsResponse | undefined)[], saved: AiFeatureView["choice"]): ModelOptions {
  const { fallback, primary } = saved;
  return useMemo(() => {
    const byItem = new Map<string, AiModelRef>();
    for (const list of lists) {
      if (!list) continue;
      for (const model of list.models) {
        const ref = { model: model.id, provider: list.provider };
        byItem.set(`${modelLabel(ref)}${model.free ? " (free)" : ""}`, ref);
      }
    }
    // A saved choice stays selectable while the lists load (or after a provider dropped it).
    for (const ref of [primary, fallback]) {
      if (ref && ![...byItem.values()].some((known) => sameAiModel(known, ref))) byItem.set(modelLabel(ref), ref);
    }
    return { byItem, items: [...byItem.keys()] };
  }, [lists, primary, fallback]);
}

/** A picker's value: Auto, no fallback, or a model. */
type ModelPick = "AUTO" | "NONE" | AiModelRef;

const samePick = (a: ModelPick, b: ModelPick) => (typeof a === "string" || typeof b === "string" ? a === b : sameAiModel(a, b));

function pickItem(options: ModelOptions, pick: ModelPick): string {
  if (pick === "AUTO") return AUTO_ITEM;
  if (pick === "NONE") return NO_FALLBACK_ITEM;
  return [...options.byItem.entries()].find(([, known]) => sameAiModel(known, pick))?.[0] ?? modelLabel(pick);
}

function itemPick(options: ModelOptions, item: string): ModelPick {
  if (item === NO_FALLBACK_ITEM) return "NONE";
  return options.byItem.get(item) ?? "AUTO";
}

function ModelPicker({
  disabled,
  id,
  items,
  label,
  onChange,
  value
}: {
  disabled: boolean;
  id: string;
  label: string;
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <Combobox disabled={disabled} id={id} items={items} onValueChange={onChange} value={value}>
        <ComboboxInput placeholder="Search models" />
        <ComboboxContent>
          <ComboboxEmpty>No model matches.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FormField>
  );
}

function TestResult({ result }: { result: TestAiModelResponse | null }) {
  if (!result) return null;
  return (
    <p className={result.ok ? "text-xs text-success-ink" : "text-xs text-app-danger-ink"} role="status">
      {result.ok ? `Answered in ${(result.latencyMs / 1000).toFixed(1)} s.` : result.message}
    </p>
  );
}

function FeatureForm({ connected, feature, lists }: { feature: AiFeatureView; connected: AiProviderId[]; lists: (AiProviderModelsResponse | undefined)[] }) {
  const save = useUpdateAiFeature();
  const test = useTestAiModel();
  const [tested, setTested] = useState<{ which: "primary" | "fallback"; result: TestAiModelResponse } | null>(null);
  const options = useModelOptions(lists, feature.choice);
  const savedPrimary: ModelPick = feature.choice.primary ?? "AUTO";
  const savedFallback: ModelPick = feature.choice.fallbackOff ? "NONE" : (feature.choice.fallback ?? "AUTO");
  const [primary, setPrimary] = useState<ModelPick>(savedPrimary);
  const [fallback, setFallback] = useState<ModelPick>(savedFallback);
  const id = `ai-feature-${feature.feature.toLowerCase()}`;
  const changed = !samePick(primary, savedPrimary) || !samePick(fallback, savedFallback);
  const sameAsMain = typeof primary !== "string" && typeof fallback !== "string" && sameAiModel(primary, fallback);

  const runTest = (which: "primary" | "fallback") => {
    const model = feature.route[which];
    if (!model) return;
    setTested(null);
    test.mutate({ model: model.model, provider: model.provider }, { onSuccess: (result) => setTested({ result, which }) });
  };

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          body: {
            fallback: typeof fallback === "string" ? null : fallback,
            fallbackOff: fallback === "NONE",
            primary: typeof primary === "string" ? null : primary
          },
          feature: feature.feature
        });
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-app-text">{feature.label}</h3>
        <p className="text-sm text-app-muted">{feature.description}</p>
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
        <dt className="font-semibold text-app-text">Runs on now</dt>
        <dd className="min-w-0 break-words text-app-muted">{routeLabel(feature.route.primary, "Nothing: connect a provider first")}</dd>
        <dd>
          {feature.route.primary ? (
            <Button isLoading={test.isPending && test.variables?.model === feature.route.primary.model} onClick={() => runTest("primary")} type="button" variant="ghost">
              Test
            </Button>
          ) : null}
        </dd>
        <dt className="font-semibold text-app-text">Fallback</dt>
        <dd className="min-w-0 break-words text-app-muted">{routeLabel(feature.route.fallback, "None")}</dd>
        <dd>
          {feature.route.fallback ? (
            <Button isLoading={test.isPending && test.variables?.model === feature.route.fallback.model} onClick={() => runTest("fallback")} type="button" variant="ghost">
              Test
            </Button>
          ) : null}
        </dd>
      </dl>
      {tested ? (
        <div className="text-xs text-app-muted">
          {tested.which === "primary" ? "Main model: " : "Fallback: "}
          <TestResult result={tested.result} />
        </div>
      ) : null}
      {connected.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModelPicker
              disabled={save.isPending}
              id={`${id}-primary`}
              items={[AUTO_ITEM, ...options.items]}
              label="Main model"
              onChange={(item) => setPrimary(item === NO_FALLBACK_ITEM ? "AUTO" : itemPick(options, item))}
              value={pickItem(options, primary)}
            />
            <ModelPicker
              disabled={save.isPending}
              id={`${id}-fallback`}
              items={[AUTO_ITEM, NO_FALLBACK_ITEM, ...options.items]}
              label="Fallback (when the main one is out of quota or down)"
              onChange={(item) => setFallback(itemPick(options, item))}
              value={pickItem(options, fallback)}
            />
          </div>
          <p className="text-xs text-app-muted">
            Auto order: {feature.auto.map(modelLabel).join(", ")}. Auto uses the first one whose provider is connected; its fallback prefers
            another provider.
          </p>
          {sameAsMain ? <p className="text-xs text-app-danger-ink">The fallback must be a different model.</p> : null}
          <div>
            <Button disabled={!changed || sameAsMain} isLoading={save.isPending} type="submit" variant="outline">
              Save models
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

// ── The tab ─────────────────────────────────────────────────

/** Platform console → AI: outside AI keys and the model each feature uses (docs/AI_PROVIDERS.md). */
export function AiProvidersTab() {
  const query = useAiIntegrations();
  const connected = useMemo(() => query.data?.providers.filter((p) => p.connected).map((p) => p.provider) ?? [], [query.data]);
  const modelQueries = useAiProviderModels(connected);
  const lists = modelQueries.map((q) => q.data);
  const listFor = (provider: AiProviderId) => lists.find((list) => list?.provider === provider);
  const failed = modelQueries.flatMap((q, i) => (q.isError ? [AI_PROVIDERS[connected[i]].label] : []));

  if (query.isLoading) return <Skeleton className="h-64 w-full rounded-app" />;
  if (query.isError || !query.data) return <WidgetError message={query.error?.message} onRetry={() => void query.refetch()} />;
  const data = query.data;

  return (
    <div className="grid gap-4">
      <SectionCard
        description="Keys for the outside AI services. Every academy's AI features use them; only pseudonymised text is ever sent. Keys are stored encrypted and never shown again."
        title="AI providers"
      >
        {!data.canStore ? (
          <Alert variant="warning">Storing keys isn&apos;t set up on this server: set CREDENTIALS_ENCRYPTION_KEY (or MFA_ENCRYPTION_KEY).</Alert>
        ) : (
          <div className="grid gap-6 divide-y divide-app-border [&>*:not(:first-child)]:pt-6">
            {data.providers.map((provider) => (
              <ProviderForm
                key={`${provider.provider}:${provider.updatedAt ?? "new"}`}
                models={listFor(provider.provider)}
                provider={provider}
              />
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard
        description="The model each AI feature uses, and a fallback for when it is out of free quota, overloaded or down. Leave on Auto to use the best model found in the provider test (docs/ai/PROVIDER_EVAL.md)."
        title="Models per feature"
      >
        {failed.length > 0 ? (
          <Alert variant="warning">Couldn&apos;t load the model list of {failed.join(", ")}. Saved choices still work.</Alert>
        ) : null}
        <div className="grid gap-6 divide-y divide-app-border [&>*:not(:first-child)]:pt-6">
          {data.features.map((feature) => (
            <FeatureForm
              connected={connected}
              feature={feature}
              // Re-mount on a saved change so the pickers show what was stored.
              key={`${feature.feature}:${JSON.stringify(feature.choice)}`}
              lists={lists}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
