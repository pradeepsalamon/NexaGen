"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState, useRef } from "react";
import type { AuthUser, UpdateProfileRequest } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/Combobox";
import { FormField } from "@/components/ui/FormField";
import { DatePicker } from "@/components/ui/DatePicker";
import { format } from "date-fns";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/providers/ToastProvider";
import { updateProfile } from "../api/authApi";
import { uploadImage, deleteImage } from "@/lib/uploadApi";
import { Upload, Edit2, Trash2 } from "lucide-react";

type ProfileFormValues = {
  avatarUrl: string;
  bio: string;
  chessRating: string;
  dateOfBirth: string;
  email: string;
  experienceLevel: string;
  firstName: string;
  fideId: string;
  fideRating: string;
  hourlyRate: string;
  lastName: string;
  parentEmail: string;
  parentName: string;
  parentPhone: string;
  parentRelationship: string;
  phoneNumber: string;
  qualification: string;
  specialization: string;
  title: string;
  timezone: string;
  username: string;
  yearsOfExperience: string;
};

const emptyValues: ProfileFormValues = {
  avatarUrl: "",
  bio: "",
  chessRating: "",
  dateOfBirth: "",
  email: "",
  experienceLevel: "BEGINNER",
  firstName: "",
  fideId: "",
  fideRating: "",
  hourlyRate: "",
  lastName: "",
  parentEmail: "",
  parentName: "",
  parentPhone: "",
  parentRelationship: "",
  phoneNumber: "",
  qualification: "",
  specialization: "",
  title: "NONE",
  timezone: "",
  username: "",
  yearsOfExperience: ""
};

const defaultTimezoneOptions = ["Asia/Kolkata", "UTC"].map((timezone) => ({
  label: timezone,
  value: timezone
}));

export function ProfileForm() {
  const toast = useToast();
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const [values, setValues] = useState<ProfileFormValues>(emptyValues);
  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: ({ user: updatedUser }) => {
      setUser(updatedUser);
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const uploadPromise = (async () => {
      if (values.avatarUrl) {
        await deleteImage(values.avatarUrl).catch(() => {});
      }
      const { url } = await uploadImage(file);
      updateField("avatarUrl", url);
      await profileMutation.mutateAsync(toProfilePayload({ ...values, avatarUrl: url }, user));
    })();

    toast.promise(uploadPromise, {
      loading: "Uploading photo...",
      success: "Photo uploaded successfully.",
      error: "Failed to upload photo."
    });

    uploadPromise.finally(() => {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    });
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    setValues({
      avatarUrl: user.avatarUrl ?? "",
      bio: user.coachProfile?.bio ?? "",
      chessRating: formatNumber(user.studentProfile?.chessRating),
      dateOfBirth: formatDate(user.studentProfile?.dateOfBirth),
      email: user.email,
      experienceLevel: user.studentProfile?.experienceLevel ?? "BEGINNER",
      firstName: user.firstName,
      fideId: user.studentProfile?.fideId ?? user.coachProfile?.fideId ?? "",
      fideRating: formatNumber(user.coachProfile?.fideRating),
      hourlyRate: user.coachProfile?.hourlyRate ?? "",
      lastName: user.lastName ?? "",
      parentEmail: user.studentProfile?.parentEmail ?? "",
      parentName: user.studentProfile?.parentName ?? "",
      parentPhone: user.studentProfile?.parentPhone ?? "",
      parentRelationship: user.studentProfile?.parentRelationship ?? "",
      phoneNumber: user.phoneNumber ?? "",
      qualification: user.coachProfile?.qualification ?? "",
      specialization: user.coachProfile?.specialization ?? "",
      title: user.coachProfile?.title ?? "NONE",
      timezone: user.timezone ?? "",
      username: user.username ?? "",
      yearsOfExperience: formatNumber(user.coachProfile?.yearsOfExperience)
    });
  }, [user]);

  const hasRequiredName = useMemo(
    () => values.firstName.trim().length > 0,
    [values.firstName]
  );
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(values.timezone),
    [values.timezone]
  );

  function updateField<TField extends keyof ProfileFormValues>(
    field: TField,
    value: ProfileFormValues[TField]
  ) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasRequiredName) {
      return;
    }

    toast.promise(profileMutation.mutateAsync(toProfilePayload(values, user)), {
      loading: "Saving profile...",
      success: "Profile updated.",
      error: "Failed to update profile."
    });
  }

  const initials = `${values.firstName.trim().charAt(0)}${values.lastName.trim().charAt(0)}`.toUpperCase() || "NC";

  return (
    <form className="mt-6 grid gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col items-center justify-center space-y-4 mb-2">
        <div className="size-24 rounded-full overflow-hidden ring-2 ring-app-border bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))] text-primary flex items-center justify-center shrink-0 shadow-sm text-3xl font-extrabold">
          {values.avatarUrl ? (
            <img src={values.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/png, image/jpeg, image/webp"
          className="hidden"
        />

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {values.avatarUrl ? (
              <><Edit2 className="mr-2 h-4 w-4" /> Change Photo</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" /> Add Photo</>
            )}
          </Button>
          {values.avatarUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 dark:hover:bg-red-950/20"
              onClick={() => {
                const oldUrl = values.avatarUrl;
                setIsUploading(true);
                
                const removePromise = (async () => {
                  await deleteImage(oldUrl);
                  updateField("avatarUrl", "");
                  await profileMutation.mutateAsync(toProfilePayload({ ...values, avatarUrl: "" }, user));
                })();

                toast.promise(removePromise, {
                  loading: "Removing photo...",
                  success: "Photo removed.",
                  error: "Failed to remove photo."
                });

                removePromise.finally(() => setIsUploading(false));
              }}
              disabled={isUploading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="profile-email" label="Email">
          <Input
            autoComplete="email"
            id="profile-email"
            inputMode="email"
            maxLength={255}
            onChange={(event) => updateField("email", event.target.value)}
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
            onChange={(event) => updateField("username", event.target.value)}
            value={values.username}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="profile-first-name" label="First Name">
          <Input
            autoComplete="given-name"
            id="profile-first-name"
            maxLength={120}
            onChange={(event) => updateField("firstName", event.target.value)}
            required
            value={values.firstName}
          />
        </FormField>
        <FormField id="profile-last-name" label="Last Name">
          <Input
            autoComplete="family-name"
            id="profile-last-name"
            maxLength={120}
            onChange={(event) => updateField("lastName", event.target.value)}
            value={values.lastName}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="profile-phone-number" label="Phone Number">
          <Input
            autoComplete="tel"
            id="profile-phone-number"
            inputMode="tel"
            maxLength={30}
            onChange={(event) => updateField("phoneNumber", event.target.value)}
            value={values.phoneNumber}
          />
        </FormField>
        <FormField id="profile-timezone" label="Timezone">
          <Combobox
            id="profile-timezone"
            items={timezoneOptions}
            onValueChange={(value) => updateField("timezone", value)}
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

      {user?.studentProfile ? (
        <section className="grid gap-4 rounded-app border border-app-border bg-app-soft/45 p-4">
          <div>
            <h2 className="text-base font-extrabold text-app-text">
              Student Profile
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Update the student details linked to your account.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="profile-parent-name" label="Parent Name">
              <Input
                id="profile-parent-name"
                maxLength={120}
                onChange={(event) =>
                  updateField("parentName", event.target.value)
                }
                required
                value={values.parentName}
              />
            </FormField>
            <FormField id="profile-parent-email" label="Parent Email">
              <Input
                id="profile-parent-email"
                inputMode="email"
                onChange={(event) =>
                  updateField("parentEmail", event.target.value)
                }
                type="email"
                value={values.parentEmail}
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="profile-parent-phone" label="Parent Phone">
              <Input
                id="profile-parent-phone"
                inputMode="tel"
                maxLength={30}
                onChange={(event) =>
                  updateField("parentPhone", event.target.value)
                }
                value={values.parentPhone}
              />
            </FormField>
            <FormField
              id="profile-parent-relationship"
              label="Parent Relationship"
            >
              <Input
                id="profile-parent-relationship"
                maxLength={80}
                onChange={(event) =>
                  updateField("parentRelationship", event.target.value)
                }
                value={values.parentRelationship}
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField id="profile-date-of-birth" label="Date of Birth">
              <DatePicker
                onChange={(date) => {
                  const dateStr = date ? format(date, "yyyy-MM-dd") : "";
                  updateField("dateOfBirth", dateStr);
                }}
                value={values.dateOfBirth ? new Date(values.dateOfBirth) : undefined}
              />
            </FormField>
            <FormField id="profile-chess-rating" label="Chess Rating">
              <Input
                id="profile-chess-rating"
                inputMode="numeric"
                min={0}
                max={4000}
                onChange={(event) =>
                  updateField("chessRating", event.target.value)
                }
                type="number"
                value={values.chessRating}
              />
            </FormField>
            <FormField id="profile-student-fide-id" label="FIDE ID">
              <Input
                id="profile-student-fide-id"
                maxLength={80}
                onChange={(event) => updateField("fideId", event.target.value)}
                value={values.fideId}
              />
            </FormField>
          </div>
          <FormField id="profile-experience-level" label="Experience Level">
            <Select
              id="profile-experience-level"
              onChange={(event) => updateField("experienceLevel", event.target.value)}
              options={[
                { label: "Beginner", value: "BEGINNER" },
                { label: "Intermediate", value: "INTERMEDIATE" },
                { label: "Advanced", value: "ADVANCED" }
              ]}
              value={values.experienceLevel}
            />
          </FormField>
        </section>
      ) : null}

      {user?.coachProfile ? (
        <section className="grid gap-4 rounded-app border border-app-border bg-app-soft/45 p-4">
          <div>
            <h2 className="text-base font-extrabold text-app-text">
              Coach Profile
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Update the coach details linked to your account.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField id="profile-coach-title" label="Title">
              <Select
                id="profile-coach-title"
                onChange={(event) => updateField("title", event.target.value)}
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
                onChange={(event) =>
                  updateField("fideRating", event.target.value)
                }
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
                  updateField("yearsOfExperience", event.target.value)
                }
                type="number"
                value={values.yearsOfExperience}
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="profile-coach-fide-id" label="FIDE ID">
              <Input
                id="profile-coach-fide-id"
                maxLength={80}
                onChange={(event) => updateField("fideId", event.target.value)}
                value={values.fideId}
              />
            </FormField>
            <FormField id="profile-hourly-rate" label="Hourly Rate">
              <Input
                id="profile-hourly-rate"
                inputMode="decimal"
                maxLength={20}
                onChange={(event) =>
                  updateField("hourlyRate", event.target.value)
                }
                value={values.hourlyRate}
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="profile-qualification" label="Qualification">
              <Input
                id="profile-qualification"
                maxLength={255}
                onChange={(event) =>
                  updateField("qualification", event.target.value)
                }
                value={values.qualification}
              />
            </FormField>
            <FormField id="profile-specialization" label="Specialization">
              <Input
                id="profile-specialization"
                maxLength={255}
                onChange={(event) =>
                  updateField("specialization", event.target.value)
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
              onChange={(event) => updateField("bio", event.target.value)}
              value={values.bio}
            />
          </FormField>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          disabled={!hasRequiredName}
          isLoading={profileMutation.isPending}
          type="submit"
        >
          {profileMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function toProfilePayload(
  values: ProfileFormValues,
  user: AuthUser | undefined
): UpdateProfileRequest {
  const payload: UpdateProfileRequest = {
    avatarUrl: optionalString(values.avatarUrl),
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: optionalString(values.lastName),
    phoneNumber: optionalString(values.phoneNumber),
    timezone: optionalString(values.timezone),
    username: optionalString(values.username)
  };

  if (user?.studentProfile) {
    payload.studentProfile = {
      chessRating: optionalNumber(values.chessRating),
      dateOfBirth: optionalString(values.dateOfBirth),
      experienceLevel: values.experienceLevel as NonNullable<
        UpdateProfileRequest["studentProfile"]
      >["experienceLevel"],
      fideId: optionalString(values.fideId),
      parentEmail: optionalString(values.parentEmail),
      parentName: optionalString(values.parentName),
      parentPhone: optionalString(values.parentPhone),
      parentRelationship: optionalString(values.parentRelationship)
    };
  }

  if (user?.coachProfile) {
    payload.coachProfile = {
      bio: optionalString(values.bio),
      fideId: optionalString(values.fideId),
      fideRating: optionalNumber(values.fideRating),
      hourlyRate: optionalString(values.hourlyRate),
      qualification: optionalString(values.qualification),
      specialization: optionalString(values.specialization),
      title: values.title as NonNullable<
        UpdateProfileRequest["coachProfile"]
      >["title"],
      yearsOfExperience: optionalNumber(values.yearsOfExperience)
    };
  }

  return payload;
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function getTimezoneOptions(currentTimezone: string): string[] {
  const intlWithTimezones = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const supportedTimezones =
    intlWithTimezones.supportedValuesOf?.("timeZone") ?? [];
  const timezoneValues = supportedTimezones.length
    ? supportedTimezones
    : defaultTimezoneOptions.map((option) => option.value);
  const uniqueTimezones = new Set(timezoneValues);
  const trimmedCurrentTimezone = currentTimezone.trim();

  if (trimmedCurrentTimezone) {
    uniqueTimezones.add(trimmedCurrentTimezone);
  }

  return [...uniqueTimezones].sort();
}
