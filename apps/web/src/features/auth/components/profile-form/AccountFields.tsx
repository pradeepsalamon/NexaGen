"use client";

import { memo, useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/Combobox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import type { ProfileFormValues } from "./profileForm.utils";
import { getTimezoneOptions } from "./profileForm.utils";

interface AccountFieldsProps {
  /** Shown as the hint of the current-password field; null hides the field. */
  passwordReason: string | null;
  values: ProfileFormValues;
  onFieldChange: <TField extends keyof ProfileFormValues>(
    field: TField,
    value: ProfileFormValues[TField]
  ) => void;
}

export const AccountFields = memo(function AccountFields({
  passwordReason,
  values,
  onFieldChange
}: AccountFieldsProps) {
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(values.timezone),
    [values.timezone]
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-email" label="Email">
          <Input
            autoComplete="email"
            id="profile-email"
            inputMode="email"
            maxLength={255}
            onChange={(event) => onFieldChange("email", event.target.value)}
            required
            type="email"
            value={values.email}
          />
        </FormField>
        <FormField id="profile-username" label="Username">
          <Input
            autoComplete="username"
            id="profile-username"
            maxLength={80}
            onChange={(event) => onFieldChange("username", event.target.value)}
            value={values.username}
          />
        </FormField>
      </div>

      {passwordReason ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            hint={passwordReason}
            id="profile-current-password"
            label="Current Password"
          >
            <Input
              autoComplete="current-password"
              id="profile-current-password"
              maxLength={200}
              onChange={(event) => onFieldChange("currentPassword", event.target.value)}
              required
              type="password"
              value={values.currentPassword}
            />
          </FormField>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-first-name" label="First Name">
          <Input
            autoComplete="given-name"
            id="profile-first-name"
            maxLength={120}
            onChange={(event) => onFieldChange("firstName", event.target.value)}
            required
            value={values.firstName}
          />
        </FormField>
        <FormField id="profile-last-name" label="Last Name">
          <Input
            autoComplete="family-name"
            id="profile-last-name"
            maxLength={120}
            onChange={(event) => onFieldChange("lastName", event.target.value)}
            value={values.lastName}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="profile-phone-number" label="Phone Number">
          <Input
            autoComplete="tel"
            id="profile-phone-number"
            inputMode="tel"
            maxLength={30}
            onChange={(event) => onFieldChange("phoneNumber", event.target.value)}
            value={values.phoneNumber}
          />
        </FormField>
        <FormField id="profile-timezone" label="Timezone">
          <Combobox
            id="profile-timezone"
            items={timezoneOptions}
            onValueChange={(value) => onFieldChange("timezone", value)}
            value={values.timezone}
          >
            <ComboboxInput placeholder="Select timezone" />
            <ComboboxContent>
              <ComboboxEmpty>No timezone found.</ComboboxEmpty>
              <ComboboxList>
                {(timezone) => (
                  <ComboboxItem key={timezone} value={timezone}>
                    {timezone}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </FormField>
      </div>
    </>
  );
});
