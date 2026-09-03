"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentsRes = {
  agents: Record<string, any>;
  roles: { roles: Record<string, any>; chains: Record<string, string[]> };
};

export default function NewTask() {
  const router = useRouter();
  const [data, setData] = useState<AgentsRes | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedChain, setSelectedChain] = useState("feature");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-app-primary" /></div>;

  const chainRoles = data.roles.chains[selectedChain] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          roles: chainRoles,
          overrides,
          models: modelOverrides,
        }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        const errData = await res.json().catch(() => ({ error: "Failed to create task" }));
        alert(errData.error || "Failed to create task");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col">
        <h1 className="text-2xl font-semibold tracking-tight">New Task</h1>
        <p className="text-app-text-muted text-sm mt-1">Initialize a new autonomous dev session.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-app-text">Prompt / Feature Summary</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-app-surface border border-app-border rounded-xl p-3 text-sm focus:outline-none focus:border-app-primary focus:ring-1 focus:ring-app-primary transition-all min-h-[120px] resize-y"
            placeholder="Describe the task for the agents..."
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-app-text">Task Type (Chain)</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(data.roles.chains).map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => setSelectedChain(chain)}
                className={cn(
                  "p-3 rounded-xl border text-sm font-medium transition-all text-left",
                  selectedChain === chain 
                    ? "bg-app-primary/10 border-app-primary text-app-primary" 
                    : "bg-app-surface border-app-border text-app-text-muted hover:border-app-border/80"
                )}
              >
                {chain}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-app-text">Role Assignments</label>
          <div className="flex flex-col gap-2">
            {chainRoles.map((role) => {
              const roleInfo = data.roles.roles[role];
              const defaultAgent = roleInfo?.default_agent;
              const currentAgent = overrides[role] || defaultAgent;
              const agentConfig = data.agents[currentAgent];
              const defaultModel = agentConfig?.default_model || agentConfig?.models?.[0]?.id || "";
              const currentModel = modelOverrides[role] || defaultModel;

              return (
                <div key={role} className="flex flex-col gap-2.5 p-3.5 bg-app-surface border border-app-border rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-app-text">{role}</span>
                      <span className="text-xs text-app-text-muted line-clamp-1">{roleInfo?.description}</span>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-app-bg border border-app-border text-app-text-muted">
                      {currentAgent}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-app-border/40">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-semibold text-app-text-muted">Agent CLI</label>
                      <select
                        value={currentAgent}
                        onChange={(e) => {
                          const newAgent = e.target.value;
                          setOverrides((prev) => ({ ...prev, [role]: newAgent }));
                          const newAgentCfg = data.agents[newAgent];
                          const newDefModel = newAgentCfg?.default_model || newAgentCfg?.models?.[0]?.id || "";
                          setModelOverrides((prev) => ({ ...prev, [role]: newDefModel }));
                        }}
                        className="bg-app-bg border border-app-border rounded-lg text-xs p-2 focus:outline-none focus:border-app-primary"
                      >
                        {Object.keys(data.agents).map((agent) => (
                          <option key={agent} value={agent}>{agent}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-semibold text-app-text-muted">Model / Speed</label>
                      <select
                        value={currentModel}
                        onChange={(e) => {
                          setModelOverrides((prev) => ({ ...prev, [role]: e.target.value }));
                        }}
                        className="bg-app-bg border border-app-border rounded-lg text-xs p-2 focus:outline-none focus:border-app-primary truncate"
                      >
                        {(agentConfig?.models || [{ id: defaultModel, label: defaultModel || "Default" }]).map((m: any) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!prompt.trim() || submitting}
          className="flex items-center justify-center gap-2 w-full py-3.5 px-4 bg-app-primary hover:bg-app-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg shadow-app-primary/25"
        >
          {submitting ? <Loader2 className="animate-spin size-5" /> : <Plus className="size-5" />}
          {submitting ? "Starting Task..." : "Create & Start Task"}
        </button>
      </form>
    </div>
  );
}
