"use client";

import { memo } from "react";
import { format, parseISO } from "date-fns";
import { FormField } from "@/components/ui/FormField";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ProfileFormValues } from "./profileForm.utils";

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
        <FormField id="profile-date-of-birth" label="Date of Birth">
          <DatePicker
            onChange={(date) => {
              onFieldChange("dateOfBirth", date ? format(date, "yyyy-MM-dd") : "");
            }}
            value={values.dateOfBirth ? parseISO(values.dateOfBirth) : undefined}
          />
        </FormField>
        <FormField id="profile-chess-rating" label="Chess Rating">
          <Input
            id="profile-chess-rating"
            inputMode="numeric"
            min={0}
            max={4000}
            onChange={(event) => onFieldChange("chessRating", event.target.value)}
            type="number"
            value={values.chessRating}
          />
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
        <FormField id="profile-experience-level" label="Experience Level">
          <Select
            id="profile-experience-level"
            onChange={(event) => onFieldChange("experienceLevel", event.target.value)}
            options={[
              { label: "Beginner", value: "BEGINNER" },
              { label: "Intermediate", value: "INTERMEDIATE" },
              { label: "Advanced", value: "ADVANCED" }
            ]}
            value={values.experienceLevel}
          />
        </FormField>
      </div>
    </section>
  );
});
