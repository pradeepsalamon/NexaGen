"use client";

import { memo } from "react";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { ProfileFormValues } from "./profileForm.utils";

interface CoachProfileFieldsProps {
  values: ProfileFormValues;
  onFieldChange: <TField extends keyof ProfileFormValues>(
    field: TField,
    value: ProfileFormValues[TField]
  ) => void;
}

export const CoachProfileFields = memo(function CoachProfileFields({
  values,
  onFieldChange
}: CoachProfileFieldsProps) {
  return (
    <section className="grid gap-4 rounded-app border border-app-border bg-app-soft/45 p-4">
      <div>
        <h2 className="text-base font-extrabold text-app-text">Coach Profile</h2>
        <p className="mt-1 text-sm text-app-muted">
          Update the coach details linked to your account.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FormField id="profile-coach-title" label="Title">
          <Select
            id="profile-coach-title"
            onChange={(event) => onFieldChange("title", event.target.value)}
            options={[
              { label: "None", value: "NONE" },
              { label: "CM", value: "CM" },
              { label: "FM", value: "FM" },
              { label: "IM", value: "IM" },
              { label: "GM", value: "GM" }
            ]}
            value={values.title}
          />
        </FormField>
        <FormField id="profile-fide-rating" label="FIDE Rating">
          <Input
            id="profile-fide-rating"
            inputMode="numeric"
            min={0}
            max={4000}
            onChange={(event) => onFieldChange("fideRating", event.target.value)}
            type="number"
            value={values.fideRating}
          />
        </FormField>
        <FormField id="profile-years" label="Years of Experience">
          <Input
            id="profile-years"
            inputMode="numeric"
            min={0}
            max={80}
            onChange={(event) =>
              onFieldChange("yearsOfExperience", event.target.value)
            }
            type="number"
            value={values.yearsOfExperience}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-coach-fide-id" label="FIDE ID">
          <Input
            id="profile-coach-fide-id"
            maxLength={80}
            onChange={(event) => onFieldChange("fideId", event.target.value)}
            value={values.fideId}
          />
        </FormField>
        <FormField id="profile-hourly-rate" label="Hourly Rate">
          <Input
            id="profile-hourly-rate"
            inputMode="decimal"
            maxLength={20}
            onChange={(event) => onFieldChange("hourlyRate", event.target.value)}
            value={values.hourlyRate}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-qualification" label="Qualification">
          <Input
            id="profile-qualification"
            maxLength={255}
            onChange={(event) => onFieldChange("qualification", event.target.value)}
            value={values.qualification}
          />
        </FormField>
        <FormField id="profile-specialization" label="Specialization">
          <Input
            id="profile-specialization"
            maxLength={255}
            onChange={(event) =>
              onFieldChange("specialization", event.target.value)
            }
            value={values.specialization}
          />
        </FormField>
      </div>
      <FormField id="profile-bio" label="Bio">
        <Textarea
          className="min-h-28"
          id="profile-bio"
          maxLength={2000}
          onChange={(event) => onFieldChange("bio", event.target.value)}
          value={values.bio}
        />
      </FormField>
    </section>
  );
});
