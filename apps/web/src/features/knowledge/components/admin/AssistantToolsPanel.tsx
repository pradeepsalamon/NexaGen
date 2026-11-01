"use client";

import { useState } from "react";
import { Bot, Loader2, Play } from "lucide-react";
import type { RunAssistantToolResponse } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useToast } from "@/providers/ToastProvider";
import { runAssistantTool } from "../../api/knowledgeApi";
import { useAssistantTools } from "../../hooks/useKnowledgeApi";

/**
 * Super admin: the tools a future AI assistant may call, and a dry run of one
 * as yourself. Tools run in the API with your own permissions; nothing here
 * talks to a model.
 */
export function AssistantToolsPanel() {
  const tools = useAssistantTools(true);
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState('{\n  "query": "how do I join a class"\n}');
  const [result, setResult] = useState<RunAssistantToolResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (name: string) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args) as Record<string, unknown>;
    } catch {
      toast.error({ title: "Arguments must be JSON." });
      return;
    }
    setBusy(true);
    try {
      setResult(await runAssistantTool({ args: parsed, name }));
    } catch (err) {
      toast.error({ message: err instanceof Error ? err.message : undefined, title: "The tool call was refused" });
    } finally {
      setBusy(false);
    }
  };

  if (tools.isError) return <WidgetError message="Tools could not be loaded." onRetry={() => void tools.refetch()} />;
  if (!tools.data) return <Skeleton className="h-40" />;
  if (!tools.data.tools.length) return <EmptyState icon={Bot} title="No tools registered" />;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-app-muted">
        Read-only tools the assistant (Phase 5b) will be offered. Each runs through the same permission rules as the page it reads from, so a
        student&apos;s assistant can only ever find student articles.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {tools.data.tools.map((t) => (
          <Card className="space-y-2 p-4" key={t.name}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-bold">{t.name}</code>
              <Badge variant="outline">{t.kind}</Badge>
            </div>
            <p className="text-sm text-app-muted">{t.description}</p>
            <p className="text-xs text-app-muted">Roles: {t.roles.join(", ")}</p>
            <details>
              <summary className="cursor-pointer text-xs font-semibold">Argument schema</summary>
              <pre className="mt-2 overflow-x-auto rounded-control bg-app-soft p-2 text-xs">{JSON.stringify(t.parameters, null, 2)}</pre>
            </details>
            <Button
              onClick={() => {
                setSelected(t.name);
                setResult(null);
                setArgs(t.name === "knowledge.get_article" ? '{\n  "slug": ""\n}' : '{\n  "query": "how do I join a class"\n}');
              }}
              size="sm"
              variant={selected === t.name ? "primary" : "outline"}
            >
              Try it
            </Button>
          </Card>
        ))}
      </div>
      {selected && (
        <Card className="space-y-3 p-4">
          <Label htmlFor="kb-tool-args">
            Arguments for <code>{selected}</code>
          </Label>
          <Textarea className="min-h-[100px] font-mono text-sm" id="kb-tool-args" onChange={(e) => setArgs(e.target.value)} value={args} />
          <Button disabled={busy} onClick={() => void run(selected)}>
            {busy ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : <Play aria-hidden className="mr-2 size-4" strokeWidth={2.5} />}
            Run as me
          </Button>
          {result && (
            <pre className="max-h-96 overflow-auto rounded-control bg-app-soft p-3 text-xs">
              {`${result.latencyMs} ms\n`}
              {JSON.stringify(result.result, null, 2)}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
