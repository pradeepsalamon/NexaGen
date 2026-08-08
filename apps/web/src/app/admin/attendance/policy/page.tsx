"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type AttendancePolicy, type UpdateAttendancePolicy } from "@nexa-chess/types";

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
        throw new Error("Present threshold must be higher than Late threshold");
      }
      if (payload.lateThreshold! <= payload.partialThreshold!) {
        throw new Error("Late threshold must be higher than Partial threshold");
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
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3 mb-8 border-b border-app-border pb-4">
        <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
          <Settings className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-app-text">Attendance Policy</h1>
          <p className="text-app-muted text-sm mt-1">Configure global attendance thresholds and calculation rules</p>
        </div>
      </div>

      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardHeader>
          <CardTitle>Calculation Thresholds</CardTitle>
          <CardDescription>
            These percentages determine the final status assigned to a student when a class ends.
            Calculated as: (Total time in class / Scheduled class duration) × 100
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Present Threshold (%)
              </Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  value={presentThreshold}
                  onChange={(e) => setPresentThreshold(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">%</span>
              </div>
              <p className="text-xs text-app-muted">Student is Present if attendance ≥ {presentThreshold}%</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                Late Threshold (%)
              </Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  value={lateThreshold}
                  onChange={(e) => setLateThreshold(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">%</span>
              </div>
              <p className="text-xs text-app-muted">Student is Late if attendance is between {lateThreshold}% and {Number(presentThreshold) - 1}%</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Partial Threshold (%)
              </Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  value={partialThreshold}
                  onChange={(e) => setPartialThreshold(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">%</span>
              </div>
              <p className="text-xs text-app-muted">Student is Partial if attendance is between {partialThreshold}% and {Number(lateThreshold) - 1}%</p>
            </div>
          </div>
          
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mt-4">
            <p className="text-sm font-medium text-red-600">
              Absent Rule: <span className="font-normal text-red-500">Students with attendance less than {partialThreshold}% will be marked as Absent.</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardHeader>
          <CardTitle>Session Rules</CardTitle>
          <CardDescription>Configure grace periods and minimums</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Grace Period (Minutes)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0"
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-2.5 text-app-muted text-sm">min</span>
              </div>
              <p className="text-xs text-app-muted">Minutes allowed to be late before triggering late flags.</p>
            </div>

            <div className="space-y-2">
              <Label>Minimum Required Duration (Minutes)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0"
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
        <Button onClick={handleSave} disabled={isSaving} className="gap-2 min-w-[120px]">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? "Saving..." : "Save Policy"}
        </Button>
      </div>
    </div>
  );
}
