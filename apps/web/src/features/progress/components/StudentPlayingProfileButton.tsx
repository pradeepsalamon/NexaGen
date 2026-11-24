"use client";

import { useRevealFormErrors } from "@/hooks/useRevealFormErrors";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Trophy } from "lucide-react";
import type { StudentPlayingProfile } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/providers/ToastProvider";
import { usePlayingProfile, useUpdatePlayingProfile } from "../hooks/useProgress";

const LEVELS = [
  { label: "Beginner", value: "BEGINNER" },
  { label: "Intermediate", value: "INTERMEDIATE" },
  { label: "Advanced", value: "ADVANCED" }
];

/**
 * Staff (an admin, or a coach of one of the student's batches): set the
 * student's rating, date of birth and level. Tournaments use them for entry,
 * age groups and seeding, so the student can't change them (review F1).
 */
export function StudentPlayingProfileButton({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const profile = usePlayingProfile(studentId, open);
  const save = useUpdatePlayingProfile(studentId);
  const [rating, setRating] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [level, setLevel] = useState<StudentPlayingProfile["experienceLevel"]>("BEGINNER");

  useEffect(() => {
    if (!open || !profile.data) return;
    setRating(profile.data.chessRating === null ? "" : String(profile.data.chessRating));
    setDateOfBirth(profile.data.dateOfBirth ?? "");
    setLevel(profile.data.experienceLevel);
  }, [open, profile.data]);

  const ratingNumber = rating.trim() === "" ? null : Number(rating);
  const ratingProblem =
    ratingNumber !== null && (!Number.isInteger(ratingNumber) || ratingNumber < 0 || ratingNumber > 4000)
      ? "Enter a whole number from 0 to 4000."
      : undefined;
  // Checked when Save is pressed, not while typing (UI_RULES § "Form errors").
  const [tried, setTried] = useState(false);
  const ratingError = tried ? ratingProblem : undefined;
  useRevealFormErrors(ratingError);

  async function submit() {
    setTried(true);
    if (ratingProblem) return;
    try {
      await save.mutateAsync({ chessRating: ratingNumber, dateOfBirth: dateOfBirth || null, experienceLevel: level });
      toast.success({ title: "Playing details saved" });
      setOpen(false);
    } catch {
      // apiFetch already showed the error.
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant="neutral">
        <Trophy className="mr-1.5 size-4" strokeWidth={2.25} />
        Rating and level
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rating and level</DialogTitle>
            <DialogDescription>
              Tournaments use these for entry, age groups and seeding, so only staff can change them.
            </DialogDescription>
          </DialogHeader>
          {profile.isPending ? (
            <p className="text-sm text-app-muted">Loading…</p>
          ) : profile.isError ? (
            <p className="text-sm text-app-muted">These details couldn&apos;t be loaded.</p>
          ) : (
            <div className="grid gap-4">
              <FormField error={ratingError} id="playing-rating" label="Chess rating">
                <Input
                  hasError={Boolean(ratingError)}
                  id="playing-rating"
                  inputMode="numeric"
                  max={4000}
                  min={0}
                  onChange={(event) => setRating(event.target.value)}
                  type="number"
                  value={rating}
                />
              </FormField>
              <FormField id="playing-date-of-birth" label="Date of birth">
                <DatePicker
                  id="playing-date-of-birth"
                  onChange={(date) => setDateOfBirth(date ? format(date, "yyyy-MM-dd") : "")}
                  value={dateOfBirth ? parseISO(dateOfBirth) : undefined}
                />
              </FormField>
              <FormField id="playing-level" label="Experience level">
                <Select
                  id="playing-level"
                  onChange={(event) => setLevel(event.target.value as StudentPlayingProfile["experienceLevel"])}
                  options={LEVELS}
                  value={level}
                />
              </FormField>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!profile.data}
              isLoading={save.isPending}
              onClick={() => void submit()}
              type="button"
              variant="primary"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
