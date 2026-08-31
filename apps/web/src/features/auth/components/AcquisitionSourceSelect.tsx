"use client";

import type { AcquisitionSourceValue } from "@nexa-chess/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export const ACQUISITION_OPTIONS: {
  label: string;
  value: AcquisitionSourceValue;
}[] = [
  { label: "Google / Search", value: "google" },
  { label: "Instagram", value: "instagram" },
  { label: "Facebook", value: "facebook" },
  { label: "YouTube", value: "youtube" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "NexaChess website", value: "website" },
  { label: "Friend or family referral", value: "referral" },
  { label: "School / Institution", value: "school" },
  { label: "A coach recommended it", value: "coach_referral" },
  { label: "Advertisement", value: "advertisement" },
  { label: "Other", value: "other" }
];

const DETAIL_SOURCES: AcquisitionSourceValue[] = ["coach_referral", "other"];

type Props = {
  value: AcquisitionSourceValue | "";
  detail: string;
  onValueChange: (value: AcquisitionSourceValue | "") => void;
  onDetailChange: (detail: string) => void;
  required?: boolean;
};

export function AcquisitionSourceSelect({
  value,
  detail,
  onValueChange,
  onDetailChange,
  required
}: Props) {
  const showDetail = DETAIL_SOURCES.includes(value as AcquisitionSourceValue);
  const detailLabel =
    value === "coach_referral" ? "Which coach?" : "Tell us more";

  return (
    <div className="grid gap-3.5">
      <FormField id="acquisition-source" label="How did you hear about NexaChess?">
        <Select
          id="acquisition-source"
          onChange={(event) =>
            onValueChange(event.target.value as AcquisitionSourceValue | "")
          }
          options={ACQUISITION_OPTIONS}
          placeholder="Choose an option"
          required={required}
          value={value}
        />
      </FormField>
      {showDetail ? (
        <FormField id="acquisition-detail" label={detailLabel}>
          <Input
            id="acquisition-detail"
            maxLength={200}
            onChange={(event) => onDetailChange(event.target.value)}
            placeholder={
              value === "coach_referral" ? "Coach's name" : "A few words"
            }
            value={detail}
          />
        </FormField>
      ) : null}
    </div>
  );
}
