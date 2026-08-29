"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Target, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface PracticeItem {
  id: string;
  title: string;
  dueDate: string;
  // Accept both the legacy Title Case values and the API enum casing.
  difficulty: string;
  status: string;
}

const DIFFICULTY_CLASS: Record<string, string> = {
  beginner: "text-green-600 border-green-200 bg-green-50",
  intermediate: "text-yellow-600 border-yellow-200 bg-yellow-50",
  advanced: "text-red-600 border-red-200 bg-red-50"
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, " ");
}

const isCompleted = (status: string) => status.toLowerCase().replace(/[ _]/g, "") === "completed";
const isPending = (status: string) => status.toLowerCase() === "pending";

interface PracticeSectionProps {
  practices?: PracticeItem[];
}

export function PracticeSection({ practices = [] }: PracticeSectionProps) {
  const timeZone = useUserTimeZone();

  return (
    <Card className="border-app-border bg-app-surface shadow-sm h-full flex flex-col">
      <CardHeader className="pb-4 border-b border-app-border/50 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-secondary" />
          Assignments & Practice
        </CardTitle>
        <Link href="/student/practice">
          <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-auto">
        {practices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="bg-app-background p-4 rounded-full mb-3 border border-app-border">
              <Target className="h-8 w-8 text-app-muted" />
            </div>
            <p className="text-app-text font-medium">No pending practice assigned.</p>
            <p className="text-sm text-app-muted mt-1">Check back later for new exercises.</p>
          </div>
        ) : (
          <div className="divide-y divide-app-border/50">
            {practices.map((practice) => (
              <div key={practice.id} className="p-5 flex flex-col sm:flex-row justify-between gap-4 hover:bg-app-background/50 transition-colors">
                <div className="space-y-2">
                  <h4 className="font-semibold text-app-text">{practice.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={
                        DIFFICULTY_CLASS[practice.difficulty.toLowerCase()] ??
                        "text-app-muted border-app-border bg-app-background"
                      }
                    >
                      {titleCase(practice.difficulty)}
                    </Badge>
                    <span className="text-app-muted font-medium bg-app-background px-2 py-0.5 rounded border border-app-border">
                      Due: {formatFullDate(practice.dueDate, timeZone)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <Link href={`/student/practice/${practice.id}`} className="w-full sm:w-auto">
                    <Button
                      variant={isCompleted(practice.status) ? "outline" : "primary"}
                      size="sm"
                      className={`w-full font-bold ${!isCompleted(practice.status) ? "bg-primary text-white hover:opacity-90" : ""}`}
                    >
                      {isPending(practice.status) ? "Start" : isCompleted(practice.status) ? "View Result" : "Resume"}
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

