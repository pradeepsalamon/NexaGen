import type { AuthUser, UpdateProfileRequest } from "@nexa-chess/types";

export type ProfileFormValues = {
  avatarUrl: string;
  bio: string;
  chessRating: string;
  dateOfBirth: string;
  email: string;
  experienceLevel: string;
  referralSource: string;
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

export const emptyValues: ProfileFormValues = {
  avatarUrl: "",
  bio: "",
  chessRating: "",
  dateOfBirth: "",
  email: "",
  experienceLevel: "BEGINNER",
  referralSource: "OTHER",
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

const defaultTimezoneOptions = ["Asia/Kolkata", "UTC"];

export function valuesFromUser(user: AuthUser): ProfileFormValues {
  return {
    avatarUrl: user.avatarUrl ?? "",
    bio: user.coachProfile?.bio ?? "",
    chessRating: formatNumber(user.studentProfile?.chessRating),
    dateOfBirth: formatDate(user.studentProfile?.dateOfBirth),
    email: user.email,
    experienceLevel: user.studentProfile?.experienceLevel ?? "BEGINNER",
    referralSource: user.studentProfile?.referralSource ?? "OTHER",
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
  };
}

export function toProfilePayload(
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
      referralSource: values.referralSource as NonNullable<
        UpdateProfileRequest["studentProfile"]
      >["referralSource"],
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

export function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

export function formatNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

export function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export function getTimezoneOptions(currentTimezone: string): string[] {
  const intlWithTimezones = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const supportedTimezones =
    intlWithTimezones.supportedValuesOf?.("timeZone") ?? [];
  const timezoneValues = supportedTimezones.length
    ? supportedTimezones
    : defaultTimezoneOptions;
  const uniqueTimezones = new Set(timezoneValues);
  const trimmedCurrentTimezone = currentTimezone.trim();

  if (trimmedCurrentTimezone) {
    uniqueTimezones.add(trimmedCurrentTimezone);
  }

  return [...uniqueTimezones].sort();
}
