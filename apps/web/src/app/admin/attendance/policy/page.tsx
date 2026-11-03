"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type AttendancePolicy, type UpdateAttendancePolicy } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";

export default function AttendancePolicyPage() {
  const [, setPolicy] = useState<AttendancePolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [presentThreshold, setPresentThreshold] = useState<string>("90");
  const [lateThreshold, setLateThreshold] = useState<string>("70");
  const [partialThreshold, setPartialThreshold] = useState<string>("30");
  const [gracePeriod, setGracePeriod] = useState<string>("5");
  const [minDuration, setMinDuration] = useState<string>("5");

  useEffect(() => {
    async function loadPolicy() {
      try {
        const result = await apiFetch<AttendancePolicy>(API_ROUTES.attendance.policy);
        setPolicy(result);
        setPresentThreshold(result.presentThreshold.toString());
        setLateThreshold(result.lateThreshold.toString());
        setPartialThreshold(result.partialThreshold.toString());
        setGracePeriod(result.gracePeriodMinutes.toString());
        setMinDuration(result.minDurationMinutes.toString());
      } catch (error) {
        toast.error("Failed to load attendance policy");
      } finally {
        setIsLoading(false);
      }
    }
    loadPolicy();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      const payload: UpdateAttendancePolicy = {
        presentThreshold: Number(presentThreshold),
        lateThreshold: Number(lateThreshold),
        partialThreshold: Number(partialThreshold),
        gracePeriodMinutes: Number(gracePeriod),
        minDurationMinutes: Number(minDuration),
      };
      
      // Basic validation
      if (payload.presentThreshold! <= payload.lateThreshold!) {
        throw new Error("The present threshold must be higher than the late threshold");
      }
      if (payload.lateThreshold! <= payload.partialThreshold!) {
        throw new Error("The late threshold must be higher than the partial threshold");
      }
      
      const result = await apiFetch<AttendancePolicy>(API_ROUTES.attendance.policy, {
        method: "PUT",
        body: payload
      });
      
      setPolicy(result);
      toast.success("Attendance policy updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update policy");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6 pb-10">
      <PageHeader
        breadcrumbs={[{ href: "/admin/attendance", label: "Attendance" }, { label: "Policy" }]}
        description="Global attendance thresholds and calculation rules."
        title="Attendance policy"
      />

      <Card className="border-app-border bg-app-surface shadow-card">
        <CardHeader>
          <CardTitle>Calculation thresholds</CardTitle>
          <CardDescription>
            These percentages determine the final status assigned to a student when a class ends.
            Calculated as: (Total time in class / Scheduled class duration) × 100
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2" htmlFor="policy-present">
                <span aria-hidden="true" className="size-2 rounded-full bg-success" />
                Present threshold (%)
              </Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  id="policy-present"
                  value={presentThreshold}
                  onChange={(e) => setPresentThreshold(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">%</span>
              </div>
              <p className="text-xs text-app-muted">Student is Present if attendance ≥ {presentThreshold}%</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2" htmlFor="policy-late">
                <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
                Late threshold (%)
              </Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  id="policy-late"
                  value={lateThreshold}
                  onChange={(e) => setLateThreshold(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">%</span>
              </div>
              <p className="text-xs text-app-muted">Student is Late if attendance is between {lateThreshold}% and {Number(presentThreshold) - 1}%</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2" htmlFor="policy-partial">
                <span aria-hidden="true" className="size-2 rounded-full bg-warning/50" />
                Partial threshold (%)
              </Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  id="policy-partial"
                  value={partialThreshold}
                  onChange={(e) => setPartialThreshold(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">%</span>
              </div>
              <p className="text-xs text-app-muted">Student is Partial if attendance is between {partialThreshold}% and {Number(lateThreshold) - 1}%</p>
            </div>
          </div>
          
          <div className="p-4 border border-warning/30 bg-warning/10 rounded-control mt-4">
            <p className="text-sm font-medium text-warning-ink">
              Absent rule: <span className="font-normal text-app-text">Students with attendance less than {partialThreshold}% will be marked as Absent.</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-app-border bg-app-surface shadow-card">
        <CardHeader>
          <CardTitle>Session rules</CardTitle>
          <CardDescription>Grace periods and minimums.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="policy-grace">Grace period (minutes)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0"
                  id="policy-grace"
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">min</span>
              </div>
              <p className="text-xs text-app-muted">Minutes allowed to be late before triggering late flags.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="policy-min">Minimum required duration (minutes)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0"
                  id="policy-min"
                  value={minDuration}
                  onChange={(e) => setMinDuration(e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">min</span>
              </div>
              <p className="text-xs text-app-muted">Absolute minimum time to be considered for any attendance.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} disabled={isSaving} className="min-w-[120px]">
          {isSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={2.5} />}
          {isSaving ? "Saving…" : "Save policy"}
        </Button>
      </div>
    </div>
  );
}
