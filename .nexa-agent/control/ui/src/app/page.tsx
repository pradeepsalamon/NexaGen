"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Activity, CheckCircle2, XCircle, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type TaskState = any; // We'll loosely type this or import types if we had them

export default function Home() {
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (res.ok) {
          const data = await res.json();
          setTasks(data);
        }
      } catch (err) {
        console.error("Failed to fetch tasks", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "PENDING":
        return { icon: Clock, color: "text-app-warning", bg: "bg-app-warning/10", border: "border-app-warning/20", label: "Pending" };
      case "RUNNING":
        return { icon: Activity, color: "text-app-primary", bg: "bg-app-primary/10", border: "border-app-primary/20", label: "Running" };
      case "TESTING":
        return { icon: Activity, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", label: "Testing" };
      case "FIXING":
        return { icon: Activity, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20", label: "Fixing" };
      case "PASS_AWAITING_APPROVAL":
        return { icon: CheckCircle2, color: "text-app-success", bg: "bg-app-success/10", border: "border-app-success/20", label: "Needs Approval" };
      case "MERGED":
        return { icon: Check, color: "text-app-success", bg: "bg-app-success/10", border: "border-app-success/20", label: "Merged" };
      case "FAILED":
      case "REJECTED":
        return { icon: XCircle, color: "text-app-error", bg: "bg-app-error/10", border: "border-app-error/20", label: status === "REJECTED" ? "Rejected" : "Failed" };
      default:
        return { icon: Clock, color: "text-app-text-muted", bg: "bg-app-border", border: "border-app-border", label: status };
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      <h1 className="text-2xl font-semibold tracking-tight">Active Tasks</h1>
      
      {loading && tasks.length === 0 ? (
        <div className="flex justify-center p-8">
          <Activity className="animate-pulse text-app-primary size-8" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center p-8 border border-dashed border-app-border rounded-2xl glass-panel">
          <p className="text-app-text-muted">No tasks found. Create one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => {
            const config = getStatusConfig(task.status);
            const StatusIcon = config.icon;
            
            // Current step logic
            const currentStepRole = task.chain[task.step_index] || task.status;

            return (
              <Link 
                href={`/task/${task.task_id}`} 
                key={task.task_id}
                className="block p-4 rounded-2xl glass-panel hover:bg-app-surface-hover hover:border-app-primary/50 transition-all group"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-app-text-muted mb-1">
                      {new Date(task.created_at).toLocaleDateString()} • {new Date(task.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                    <h3 className="font-medium text-app-text line-clamp-2 leading-tight">
                      {task.feature_summary || task.task_id}
                    </h3>
                  </div>
                  <ChevronRight className="text-app-border group-hover:text-app-primary transition-colors shrink-0 mt-2" />
                </div>
                
                <div className="flex items-center gap-2 mt-4 text-xs font-medium">
                  <span className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border", config.color, config.bg, config.border)}>
                    <StatusIcon className="size-3.5" />
                    {config.label}
                  </span>
                  
                  {(task.status === "RUNNING" || task.status === "TESTING" || task.status === "FIXING") && (
                    <span className="text-app-text-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-app-primary animate-ping" />
                      {currentStepRole}
                    </span>
                  )}
                  
                  {task.attempt > 1 && (
                    <span className="text-app-warning border border-app-warning/20 bg-app-warning/10 px-2 py-0.5 rounded-full">
                      Attempt {task.attempt}/{task.max_attempts}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
