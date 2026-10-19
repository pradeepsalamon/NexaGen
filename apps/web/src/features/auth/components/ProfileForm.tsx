"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/providers/ToastProvider";
import { updateProfile } from "../api/authApi";
import { uploadImage, deleteImage } from "@/lib/uploadApi";
import { AvatarUploader } from "./profile-form/AvatarUploader";
import { AccountFields } from "./profile-form/AccountFields";
import { StudentProfileFields } from "./profile-form/StudentProfileFields";
import { CoachProfileFields } from "./profile-form/CoachProfileFields";
import {
  type ProfileFormValues,
  emptyValues,
  isEmailChanged,
  toProfilePayload,
  valuesFromUser
} from "./profile-form/profileForm.utils";

function cleanPayload<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = cleanPayload(value as Record<string, unknown>);
        if (Object.keys(nested).length > 0) {
          result[key] = nested;
        }
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}

export function ProfileForm() {
  const toast = useToast();
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const [values, setValues] = useState<ProfileFormValues>(emptyValues);
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(false);

  // undo: intentionally excluded — self-service account settings form with an
  // explicit Save button, not a row action; may also change the password
  // field, which undo should never silently revert (see docs/UNDO_ARCHITECTURE.md §4).
  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: ({ user: updatedUser }) => {
      setUser(updatedUser);
    }
  });

  useEffect(() => {
    if (!user) return;
    setValues(valuesFromUser(user));
  }, [user]);

  const updateField = useCallback(
    <TField extends keyof ProfileFormValues>(
      field: TField,
      value: ProfileFormValues[TField]
    ) => {
      setValues((currentValues) => ({ ...currentValues, [field]: value }));
    },
    []
  );

  const hasRequiredName = useMemo(
    () => values.firstName.trim().length > 0,
    [values.firstName]
  );
  const emailChanged = isEmailChanged(values, user);
  const canSubmit = hasRequiredName && (!emailChanged || values.currentPassword.length > 0);

  const handleAvatarUpload = useCallback(
    (file: File) => {
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      setIsUploading(true);
      const uploadPromise = (async () => {
        try {
          if (values.avatarUrl) {
            await deleteImage(values.avatarUrl).catch(() => {});
          }
          const { url } = await uploadImage(file);
          updateField("avatarUrl", url);
          await profileMutation.mutateAsync(
            cleanPayload(
              toProfilePayload({ ...values, avatarUrl: url, email: user?.email ?? values.email }, user)
            )
          );
        } finally {
          uploadingRef.current = false;
        }
      })();

      toast.promise(uploadPromise, {
        loading: "Uploading photo...",
        success: "Photo uploaded successfully.",
        error: "Failed to upload photo."
      });

      uploadPromise.finally(() => setIsUploading(false));
    },
    [values, user, updateField, profileMutation, toast]
  );

  const handleAvatarRemove = useCallback(() => {
    if (uploadingRef.current || !values.avatarUrl) return;
    const oldUrl = values.avatarUrl;
    uploadingRef.current = true;
    setIsUploading(true);

    const removePromise = (async () => {
      try {
        await deleteImage(oldUrl);
        updateField("avatarUrl", "");
        await profileMutation.mutateAsync(
          cleanPayload(
            toProfilePayload({ ...values, avatarUrl: "", email: user?.email ?? values.email }, user)
          )
        );
      } finally {
        uploadingRef.current = false;
      }
    })();

    toast.promise(removePromise, {
      loading: "Removing photo...",
      success: "Photo removed.",
      error: "Failed to remove photo."
    });

    removePromise.finally(() => setIsUploading(false));
  }, [values, user, updateField, profileMutation, toast]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      await profileMutation.mutateAsync(cleanPayload(toProfilePayload(values, user)));
      toast.success({ title: "Profile updated." });
    } catch (error) {
      // The server's reason matters here ("Current password is incorrect.").
      toast.error({
        title: "Failed to update profile.",
        message: error instanceof Error ? error.message : undefined
      });
    }
  }

  const initials =
    `${values.firstName.trim().charAt(0)}${values.lastName.trim().charAt(0)}`.toUpperCase() ||
    "NC";

  return (
    <form className="mt-6 grid gap-6" onSubmit={handleSubmit}>
      <AvatarUploader
        avatarUrl={values.avatarUrl}
        initials={initials}
        isUploading={isUploading}
        onUpload={handleAvatarUpload}
        onRemove={handleAvatarRemove}
      />

      <AccountFields emailChanged={emailChanged} values={values} onFieldChange={updateField} />

      {user?.studentProfile ? (
        <StudentProfileFields values={values} onFieldChange={updateField} />
      ) : null}

      {user?.coachProfile ? (
        <CoachProfileFields values={values} onFieldChange={updateField} />
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          disabled={!canSubmit}
          isLoading={profileMutation.isPending}
          type="submit"
        >
          {profileMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
