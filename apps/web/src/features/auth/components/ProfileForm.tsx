"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  toProfilePayload,
  valuesFromUser
} from "./profile-form/profileForm.utils";

export function ProfileForm() {
  const toast = useToast();
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const [values, setValues] = useState<ProfileFormValues>(emptyValues);
  const [isUploading, setIsUploading] = useState(false);

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

  const handleAvatarUpload = useCallback(
    (file: File) => {
      setIsUploading(true);
      const uploadPromise = (async () => {
        if (values.avatarUrl) {
          await deleteImage(values.avatarUrl).catch(() => {});
        }
        const { url } = await uploadImage(file);
        updateField("avatarUrl", url);
        await profileMutation.mutateAsync(
          toProfilePayload({ ...values, avatarUrl: url }, user)
        );
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
    const oldUrl = values.avatarUrl;
    setIsUploading(true);

    const removePromise = (async () => {
      await deleteImage(oldUrl);
      updateField("avatarUrl", "");
      await profileMutation.mutateAsync(
        toProfilePayload({ ...values, avatarUrl: "" }, user)
      );
    })();

    toast.promise(removePromise, {
      loading: "Removing photo...",
      success: "Photo removed.",
      error: "Failed to remove photo."
    });

    removePromise.finally(() => setIsUploading(false));
  }, [values, user, updateField, profileMutation, toast]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasRequiredName) return;

    toast.promise(profileMutation.mutateAsync(toProfilePayload(values, user)), {
      loading: "Saving profile...",
      success: "Profile updated.",
      error: "Failed to update profile."
    });
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

      <AccountFields values={values} onFieldChange={updateField} />

      {user?.studentProfile ? (
        <StudentProfileFields values={values} onFieldChange={updateField} />
      ) : null}

      {user?.coachProfile ? (
        <CoachProfileFields values={values} onFieldChange={updateField} />
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
