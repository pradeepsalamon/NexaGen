"use client";

import { memo } from "react";
import { format, parseISO } from "date-fns";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ProfileFormValues } from "./profileForm.utils";

const STAFF_SET_HINT = "Set by your coach or academy.";
const LEVEL_LABELS: Record<string, string> = {
  ADVANCED: "Advanced",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate"
};

interface StudentProfileFieldsProps {
  values: ProfileFormValues;
  onFieldChange: <TField extends keyof ProfileFormValues>(
    field: TField,
    value: ProfileFormValues[TField]
  ) => void;
}

export const StudentProfileFields = memo(function StudentProfileFields({
  values,
  onFieldChange
}: StudentProfileFieldsProps) {
  return (
    <section className="grid gap-4 rounded-app border border-app-border bg-app-soft/45 p-4">
      <div>
        <h2 className="text-base font-extrabold text-app-text">Student Profile</h2>
        <p className="mt-1 text-sm text-app-muted">
          Update the student details linked to your account.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-parent-name" label="Parent Name">
          <Input
            id="profile-parent-name"
            maxLength={120}
            onChange={(event) => onFieldChange("parentName", event.target.value)}
            required
            value={values.parentName}
          />
        </FormField>
        <FormField id="profile-parent-email" label="Parent Email">
          <Input
            id="profile-parent-email"
            inputMode="email"
            onChange={(event) => onFieldChange("parentEmail", event.target.value)}
            type="email"
            value={values.parentEmail}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-parent-phone" label="Parent/Guardian Phone Number">
          <Input
            id="profile-parent-phone"
            inputMode="tel"
            maxLength={30}
            onChange={(event) => onFieldChange("parentPhone", event.target.value)}
            value={values.parentPhone}
          />
        </FormField>
        <FormField id="profile-parent-relationship" label="Parent Relationship">
          <Input
            id="profile-parent-relationship"
            maxLength={80}
            onChange={(event) =>
              onFieldChange("parentRelationship", event.target.value)
            }
            value={values.parentRelationship}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Staff-set (review F1): tournaments use these for entry, age groups and seeding. */}
        <FormField hint={STAFF_SET_HINT} id="profile-date-of-birth" label="Date of Birth">
          <Input
            id="profile-date-of-birth"
            readOnly
            value={values.dateOfBirth ? format(parseISO(values.dateOfBirth), "d MMM yyyy") : "Not set"}
          />
        </FormField>
        <FormField hint={STAFF_SET_HINT} id="profile-chess-rating" label="Chess Rating">
          <Input id="profile-chess-rating" readOnly value={values.chessRating || "Not set"} />
        </FormField>
        <FormField id="profile-student-fide-id" label="FIDE ID">
          <Input
            id="profile-student-fide-id"
            maxLength={80}
            onChange={(event) => onFieldChange("fideId", event.target.value)}
            value={values.fideId}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-referral-source" label="How you known nexachess?">
          <Select
            id="profile-referral-source"
            onChange={(event) => onFieldChange("referralSource", event.target.value)}
            options={[
              { label: "Ads", value: "ADS" },
              { label: "Friend", value: "FRIEND" },
              { label: "School", value: "SCHOOL" },
              { label: "Others", value: "OTHER" }
            ]}
            value={values.referralSource}
          />
        </FormField>
        <FormField hint={STAFF_SET_HINT} id="profile-experience-level" label="Experience Level">
          <Input
            id="profile-experience-level"
            readOnly
            value={LEVEL_LABELS[values.experienceLevel] ?? "Not set"}
          />
        </FormField>
      </div>
    </section>
  );
});
