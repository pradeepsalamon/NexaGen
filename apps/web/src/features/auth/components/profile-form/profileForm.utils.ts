import { isParentContactChange, type AuthUser, type UpdateProfileRequest } from "@nexa-chess/types";

export type ProfileFormValues = {
  avatarUrl: string;
  bio: string;
  chessRating: string;
  currentPassword: string;
  dateOfBirth: string;
  email: string;
  experienceLevel: string;
  referralSource: string;
  firstName: string;
  fideId: string;
  fideRating: string;
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
  currentPassword: "",
  dateOfBirth: "",
  email: "",
  experienceLevel: "BEGINNER",
  referralSource: "OTHER",
  firstName: "",
  fideId: "",
  fideRating: "",
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
    currentPassword: "",
    dateOfBirth: formatDate(user.studentProfile?.dateOfBirth),
    email: user.email,
    experienceLevel: user.studentProfile?.experienceLevel ?? "BEGINNER",
    referralSource: user.studentProfile?.referralSource ?? "OTHER",
    firstName: user.firstName,
    fideId: user.studentProfile?.fideId ?? user.coachProfile?.fideId ?? "",
    fideRating: formatNumber(user.coachProfile?.fideRating),
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
    currentPassword: passwordRequiredReason(values, user) ? values.currentPassword : undefined,
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: optionalString(values.lastName),
    phoneNumber: optionalString(values.phoneNumber),
    timezone: optionalString(values.timezone),
    username: optionalString(values.username)
  };

  if (user?.studentProfile) {
    // Rating, date of birth and level are staff-set (review F1), so not sent.
    payload.studentProfile = {
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

/** The API asks for the current password only when the email changes. */
export function isEmailChanged(values: ProfileFormValues, user: AuthUser | undefined) {
  return Boolean(user) && values.email.trim().toLowerCase() !== user?.email.toLowerCase();
}

/** Same shared rule the API applies (V7): the parent contact gets invoices and notices. */
export function isParentContactChanged(values: ProfileFormValues, user: AuthUser | undefined) {
  return Boolean(user?.studentProfile) && isParentContactChange(user?.studentProfile ?? {}, values);
}

/** Same rule as the API: the phone can receive password resets (review A2). */
export function isPhoneChanged(values: ProfileFormValues, user: AuthUser | undefined) {
  return Boolean(user) && (values.phoneNumber.trim() || null) !== (user?.phoneNumber ?? null);
}

/** Why the current password is needed for this save, or null when it isn't. */
export function passwordRequiredReason(values: ProfileFormValues, user: AuthUser | undefined): string | null {
  const email = isEmailChanged(values, user);
  const phone = isPhoneChanged(values, user);
  const parent = isParentContactChanged(values, user);
  const what = [
    email ? "your email address" : null,
    phone ? "your phone number" : null,
    parent ? "the parent contact" : null
  ].filter(Boolean);
  if (what.length === 0) return null;
  const list = what.length === 1 ? what[0] : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`;
  return `Required to change ${list}.${parent ? " The previous contact will be told." : ""}`;
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
