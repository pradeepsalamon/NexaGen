"use client";

/**
 * Future extension placeholder components.
 *
 * These components define extension points for features that will be
 * developed in upcoming releases. Each can be registered as a sidebar
 * tab or modal panel in the meeting interface.
 */

import {
  LayoutGrid,
  PenTool,
  FileText,
  BookOpen,
  ClipboardList,
  Bot,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Shared Placeholder Layout ───────────────────────────────

interface PlaceholderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

function ExtensionPlaceholder({ icon, title, description, className }: PlaceholderProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-8 text-center",
        className,
      )}
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-app bg-primary/10 border border-primary/10">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-app-text mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-app-muted leading-relaxed max-w-[240px]">
        {description}
      </p>
      <span className="mt-4 inline-flex items-center rounded-full bg-app-soft px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-app-muted">
        Coming Soon
      </span>
    </div>
  );
}

// ─── Extension Components ────────────────────────────────────

export function ChessboardPanel() {
  return (
    <ExtensionPlaceholder
      icon={<LayoutGrid className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="Live Chessboard"
      description="Interactive chessboard for live demonstrations, analysis, and student practice."
    />
  );
}

export function WhiteboardPanel() {
  return (
    <ExtensionPlaceholder
      icon={<PenTool className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="Whiteboard"
      description="Collaborative whiteboard for drawing diagrams, explaining concepts, and annotations."
    />
  );
}

export function PgnViewerPanel() {
  return (
    <ExtensionPlaceholder
      icon={<FileText className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="PGN Viewer"
      description="View, analyze, and step through chess games in PGN format during class."
    />
  );
}

export function CoachNotesPanel() {
  return (
    <ExtensionPlaceholder
      icon={<BookOpen className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="Coach Notes"
      description="Private notes and lesson plans for coaches to reference during the session."
    />
  );
}

export function HomeworkPanel() {
  return (
    <ExtensionPlaceholder
      icon={<ClipboardList className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="Homework"
      description="Assign and review homework, puzzles, and exercises for students."
    />
  );
}

export function AiAssistantPanel() {
  return (
    <ExtensionPlaceholder
      icon={<Bot className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="AI Assistant"
      description="AI-powered teaching assistant for real-time analysis and suggestions."
    />
  );
}

export function ClassroomAnalyticsPanel() {
  return (
    <ExtensionPlaceholder
      icon={<BarChart3 className="size-8 text-primary-ink" strokeWidth={1.5} />}
      title="Classroom Analytics"
      description="Live engagement metrics, attention tracking, and session statistics."
    />
  );
}
