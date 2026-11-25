"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useClassRecap } from "../hooks/useClassRecaps";
import { ClassRecapContentView } from "./ClassRecapContentView";
import { ClassRecapDialog } from "./ClassRecapDialog";
import { ClassRecapStatusBadge } from "./ClassRecapStatusBadge";

const STAFF_HINT: Record<string, string> = {
  DISCARDED: "Discarded. Students don't see it.",
  FAILED: "The AI couldn't write a recap of this class.",
  PUBLISHED: "Students of this class can read it.",
  QUEUED: "Waiting to be written. It runs between classes.",
  READY: "A draft is waiting for your review. Students see nothing until it is published.",
  RUNNING: "The AI is writing it now.",
  SKIPPED: "No recap: there was no usable transcript."
};

/**
 * The AI recap on a class's page (after-class summary, completed class).
 * Staff see its status and open the review; students see it once published.
 * Renders nothing when the class has no recap.
 */
export function ClassRecapCard({ classId }: { classId: string }) {
  const query = useClassRecap(classId);
  const [open, setOpen] = useState(false);
  const data = query.data;
  if (!data?.recap) return null;

  if (data.viewer === "STUDENT") {
    return (
      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-app-text">
          <Sparkles aria-hidden="true" className="size-5 text-primary-ink" strokeWidth={2.5} />
          Class recap
        </h2>
        <ClassRecapContentView aiLabel={data.recap.aiLabel} content={data.recap.content} />
      </Card>
    );
  }

  const recap = data.recap;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0 space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-app-text">
          <Sparkles aria-hidden="true" className="size-5 text-primary-ink" strokeWidth={2.5} />
          AI class recap
          <ClassRecapStatusBadge status={recap.status} />
        </h2>
        <p className="text-sm text-app-muted">{STAFF_HINT[recap.status]}</p>
      </div>
      <Button type="button" variant={recap.status === "READY" ? "primary" : "outline"} onClick={() => setOpen(true)}>
        {recap.status === "READY" ? "Review recap" : "Open recap"}
      </Button>
      <ClassRecapDialog classId={open ? classId : null} onOpenChange={setOpen} />
    </Card>
  );
}
