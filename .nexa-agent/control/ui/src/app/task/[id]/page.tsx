"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, FileCode, Loader2, Terminal, X, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type TaskState = any;

export default function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const [task, setTask] = useState<TaskState | null>(null);
  const [diffData, setDiffData] = useState<{ stat: string; files: Array<{ file: string; added: number; removed: number; diff: string }> } | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);
  const [commits, setCommits] = useState<{ sha: string; subject: string }[]>([]);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams) return;

    const fetchTask = async () => {
      try {
        const res = await fetch(`/api/tasks/${resolvedParams.id}`);
        if (res.ok) {
          const data = await res.json();
          setTask(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchDiff = async () => {
      try {
        const res = await fetch(`/api/tasks/${resolvedParams.id}/diff`);
        if (res.ok) {
          const d = await res.json();
          setDiffData(d);
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchTask();
    fetchDiff();
    const interval = setInterval(() => {
      fetchTask();
      fetchDiff();
    }, 3000);
    return () => clearInterval(interval);
  }, [resolvedParams]);

  useEffect(() => {
    if (!task?.task_id) return;
    void fetch(`/api/tasks/${task.task_id}/commits`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCommits(d.commits ?? []));
  }, [task?.task_id, task?.status]);

  if (loading && !task) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-app-primary" /></div>;
  if (!task) return <div className="p-8 text-center text-app-error">Task not found</div>;

  const handleRevert = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.task_id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "Human (UI)" }),
      });
      if (!res.ok) alert((await res.json()).error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/tasks/${task.task_id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approver: "Human (UI)" })
      });
      // Will poll and update
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await fetch(`/api/tasks/${task.task_id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason })
      });
      setShowReject(false);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "PASS_AWAITING_APPROVAL" || status === "MERGED") return "text-app-success";
    if (status === "FAILED" || status === "REJECTED") return "text-app-error";
    // Cut short, not failed -- the work is fine, the session was interrupted.
    if (status === "PENDING" || status === "BLOCKED_RETRY") return "text-app-warning";
    return "text-app-primary";
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/tasks/${task.task_id}/resume`, { method: "POST" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-app-surface transition-colors">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold tracking-tight line-clamp-1">{task.feature_summary || task.task_id}</h1>
          <span className={cn("text-sm font-medium", getStatusColor(task.status))}>{task.status.replace(/_/g, " ")}</span>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col">
            <span className="text-app-text-muted text-xs">Branch</span>
            <span className="font-mono text-app-primary truncate">{task.branch}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-app-text-muted text-xs">Attempt</span>
            <span>{task.attempt} / {task.max_attempts}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-2 border-t border-app-border/40">
          <span className="text-app-text-muted text-xs font-medium">Pipeline Chain</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {task.chain?.map((r: string, rIdx: number) => {
              const isPast = rIdx < task.step_index;
              const isCurrent = rIdx === task.step_index && task.status === "RUNNING";
              const agent = task.role_agents?.[r] || "agent";
              return (
                <div key={r} className="flex items-center gap-1.5">
                  <div className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border",
                    isCurrent && "bg-app-primary/15 border-app-primary text-app-primary animate-pulse",
                    isPast && "bg-app-success/15 border-app-success/40 text-app-success",
                    !isCurrent && !isPast && "bg-app-bg border-app-border text-app-text-muted"
                  )}>
                    {isPast && <Check className="size-3" />}
                    {isCurrent && <Loader2 className="size-3 animate-spin" />}
                    <span>{r}</span>
                    <span className="opacity-60 text-[10px]">({agent})</span>
                  </div>
                  {rIdx < task.chain.length - 1 && (
                    <span className="text-app-text-muted text-xs">➔</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {task.status === "BLOCKED_RETRY" && (
        <div className="glass-panel rounded-2xl p-4 border-app-warning/30 flex flex-col gap-3 bg-app-warning/5">
          <h2 className="text-lg font-semibold text-app-warning">Interrupted, not failed</h2>
          <p className="text-sm text-app-text-muted">
            The agent session was cut short before it finished — usually an account usage limit or an
            API error. Whatever it had already committed is safe on <code className="font-mono">{task.branch}</code>.
            Resuming starts a fresh session for the same step and hands it that work to continue from.
          </p>
          {task.failure_reason && (
            <p className="bg-app-surface/90 border border-app-border rounded-xl p-3 text-xs font-mono whitespace-pre-wrap">
              {task.failure_reason}
            </p>
          )}
          <button
            onClick={handleResume}
            disabled={actionLoading}
            className="rounded-xl bg-app-warning px-4 py-3 font-medium text-app-bg transition-opacity disabled:opacity-50"
          >
            {actionLoading ? "Resuming…" : "Resume this step"}
          </button>
        </div>
      )}

      {task.status === "PASS_AWAITING_APPROVAL" && (() => {
        const totalFilesChanged = task.steps?.reduce((acc: number, s: any) => acc + (s.files_changed?.length || 0), 0) || 0;
        const lastNotes = task.steps?.slice().reverse().find((s: any) => s.notes)?.notes;

        return (
          <div className="glass-panel rounded-2xl p-4 border-app-success/30 flex flex-col gap-4 bg-app-success/5">
            <h2 className="text-lg font-semibold text-app-success flex items-center gap-2">
              <CheckCircle2 className="size-5" /> 
              {totalFilesChanged > 0 ? "Committed — your call" : "Response Ready"}
            </h2>
            <p className="text-sm text-app-text-muted">
              {totalFilesChanged > 0
                ? `The tests passed and the work is already committed on ${task.branch} — there is no branch to merge. Keep it, or revert the commits below.`
                : "The agent completed the analysis without modifying any source files."}
            </p>

            {lastNotes && (
              <div className="bg-app-surface/90 border border-app-border rounded-xl p-3 text-xs font-mono text-app-text whitespace-pre-wrap">
                <span className="font-semibold text-app-text-muted uppercase text-[10px] block mb-1">Agent Response / Notes:</span>
                {lastNotes}
              </div>
            )}
            
            {!showReject ? (
              <div className="flex gap-3 mt-2">
                {commits.length > 0 && (
              <div className="rounded-xl border border-app-border bg-app-surface/90 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase text-app-text-muted">
                  {commits.length} commit{commits.length === 1 ? "" : "s"} on {task.branch}
                </p>
                <div className="flex flex-col gap-1.5">
                  {commits.map((c) => (
                    <div key={c.sha} className="flex gap-2 text-xs">
                      <code className="shrink-0 font-mono text-app-primary">{c.sha.slice(0, 8)}</code>
                      <span className="min-w-0 break-words">{c.subject}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleRevert}
                  disabled={actionLoading}
                  className="mt-3 w-full rounded-lg border border-app-error/40 py-2 text-xs font-medium text-app-error transition-colors hover:bg-app-error hover:text-white disabled:opacity-50"
                >
                  Revert these commits
                </button>
              </div>
            )}

            <button 
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="flex-1 bg-app-success hover:bg-app-success/90 text-white py-2.5 rounded-xl font-medium transition-colors flex justify-center items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="animate-spin size-4" /> : <Check className="size-4" />}
                  {totalFilesChanged > 0 ? "Approve & Merge" : "Acknowledge & Close"}
                </button>
                <button 
                  onClick={() => setShowReject(true)}
                  disabled={actionLoading}
                  className="flex-1 bg-app-surface border border-app-border hover:bg-app-surface-hover py-2.5 rounded-xl font-medium transition-colors flex justify-center items-center gap-2"
                >
                  <X className="size-4" /> Reject
                </button>
              </div>
            ) : (
            <div className="flex flex-col gap-3 mt-2 animate-in slide-in-from-top-2">
              <textarea 
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (will be sent to bug-fixer)..."
                className="w-full bg-app-bg border border-app-border rounded-xl p-3 text-sm focus:outline-none focus:border-app-error"
                rows={3}
              />
              <div className="flex gap-2">
                <button 
                  onClick={handleReject}
                  disabled={actionLoading || !rejectReason.trim()}
                  className="flex-1 bg-app-error hover:bg-app-error/90 text-white py-2 rounded-xl font-medium transition-colors"
                >
                  Confirm Reject
                </button>
                <button 
                  onClick={() => setShowReject(false)}
                  className="flex-1 bg-app-surface py-2 rounded-xl font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {diffData && diffData.files && diffData.files.length > 0 && (
        <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <FileCode className="size-4 text-app-primary" /> Changed Files ({diffData.files.length})
            </h2>
            <span className="text-xs font-mono text-app-text-muted truncate max-w-[200px]">
              {diffData.stat.split('\n').pop()?.trim()}
            </span>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            {diffData.files.map((file) => {
              const isExpanded = !!expandedFiles[file.file];
              return (
                <div key={file.file} className="border border-app-border rounded-xl overflow-hidden bg-app-surface/60">
                  <button
                    type="button"
                    onClick={() => setExpandedFiles((prev) => ({ ...prev, [file.file]: !prev[file.file] }))}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-app-surface transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {isExpanded ? <ChevronDown className="size-4 shrink-0 text-app-text-muted" /> : <ChevronRight className="size-4 shrink-0 text-app-text-muted" />}
                      <span className="font-mono text-xs text-app-text truncate">{file.file}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                      {file.added > 0 && <span className="text-app-success">+{file.added}</span>}
                      {file.removed > 0 && <span className="text-app-error">-{file.removed}</span>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-app-border bg-app-bg p-3 overflow-x-auto text-[11px] font-mono leading-relaxed max-h-96">
                      {file.diff.split('\n').map((line, lIdx) => {
                        const isAdd = line.startsWith('+') && !line.startsWith('+++');
                        const isDel = line.startsWith('-') && !line.startsWith('---');
                        const isHeader = line.startsWith('@@') || line.startsWith('diff');
                        return (
                          <div
                            key={lIdx}
                            className={cn(
                              "whitespace-pre",
                              isAdd && "bg-app-success/15 text-app-success -mx-3 px-3",
                              isDel && "bg-app-error/15 text-app-error -mx-3 px-3",
                              isHeader && "text-app-primary/80 font-bold"
                            )}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-app-text-muted uppercase tracking-wider pl-1">Timeline</h2>
        
        <div className="flex flex-col gap-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-app-border before:to-transparent">
          {/* Active Running Step Card */}
          {task.status === "RUNNING" && (() => {
            const currentRole = task.chain?.[task.step_index] || "agent";
            const currentAgent = task.role_agents?.[currentRole] || "agent";

            return (
              <div className="relative flex items-start gap-4 z-10 animate-pulse">
                <div className="flex items-center justify-center size-10 rounded-full border-4 border-app-bg shrink-0 shadow-sm bg-app-primary text-white">
                  <Loader2 className="size-5 animate-spin" />
                </div>
                <div className="flex flex-col bg-app-surface border border-app-primary/60 rounded-2xl p-4 w-full shadow-lg shadow-app-primary/10">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-app-primary">{currentRole}</span>
                      <span className="text-[10px] bg-app-primary/15 text-app-primary px-2 py-0.5 rounded-full font-medium">Running Now</span>
                    </div>
                    <span className="text-xs text-app-text-muted">In Progress</span>
                  </div>
                  <div className="flex gap-2 text-xs text-app-text-muted mb-2">
                    <span className="font-medium text-app-text">{currentAgent}</span>
                    <span>•</span>
                    <span>Step {task.step_index + 1} of {task.chain?.length || 1}</span>
                    <span>•</span>
                    <span>Attempt {task.attempt}</span>
                  </div>
                  <p className="text-xs text-app-text-muted mt-1 leading-relaxed">
                    Agent is actively running in a headless CLI session, inspecting codebase context, and executing your request...
                  </p>
                </div>
              </div>
            );
          })()}

          {task.steps.length === 0 && task.status !== "RUNNING" && (
            <div className="text-xs text-app-text-muted p-4 text-center glass-panel rounded-2xl">
              No steps executed yet.
            </div>
          )}

          {task.steps.map((step: any, idx: number) => {
            const isOk = step.outcome === "ok";
            const isTest = step.role === "tester-e2e";
            const pass = isTest ? step.test_pass : true;
            const success = isOk && pass;
            
            return (
              <div key={idx} className="relative flex items-start gap-4 z-10">
                <div className={cn(
                  "flex items-center justify-center size-10 rounded-full border-4 border-app-bg shrink-0 shadow-sm",
                  success ? "bg-app-success" : (isTest && !pass ? "bg-app-error" : "bg-app-surface border-app-border text-app-text-muted")
                )}>
                  {success ? <CheckCircle2 className="size-5 text-white" /> : (isTest && !pass ? <XCircle className="size-5 text-white" /> : <Terminal className="size-4" />)}
                </div>
                <div className="flex flex-col bg-app-surface border border-app-border rounded-2xl p-4 w-full">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-sm">{step.role}</span>
                    <span className="text-xs text-app-text-muted">{new Date(step.ended_at || step.started_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <div className="flex gap-2 text-xs text-app-text-muted mb-3">
                    <span>{step.agent}</span>
                    <span>•</span>
                    <span>Attempt {step.attempt}</span>
                    <span>•</span>
                    <span>Session {step.session}</span>
                  </div>
                  
                  {step.files_changed?.length > 0 && (
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="text-xs font-medium flex items-center gap-1"><FileCode className="size-3" /> Changed Files:</span>
                      <div className="flex flex-wrap gap-1">
                        {step.files_changed.map((f: string) => (
                          <span key={f} className="text-[10px] bg-app-bg px-2 py-0.5 rounded border border-app-border truncate max-w-full">
                            {f.split('/').pop()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.notes && (
                    <div className={cn(
                      "mt-3 p-3 rounded-xl text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap",
                      isTest && !pass 
                        ? "bg-app-error/10 border border-app-error/20 text-app-error" 
                        : "bg-app-bg border border-app-border text-app-text"
                    )}>
                      <span className="font-semibold text-app-text-muted uppercase text-[10px] block mb-1">
                        {isTest && !pass ? "Failure Details:" : "Agent Output / Summary:"}
                      </span>
                      {step.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
