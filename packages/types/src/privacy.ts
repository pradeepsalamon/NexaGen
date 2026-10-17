/** Version tag on every export, so a later shape change is detectable. */
export const PERSONAL_DATA_EXPORT_FORMAT = "nexa-personal-data/v1";

export type PersonalDataRecord = Record<string, unknown>;

/**
 * Everything the platform holds about the caller, as JSON. Secrets (password
 * hash, MFA secret, session and reset tokens) are never included, nor are
 * actions the caller took on other people's records as staff.
 */
export type PersonalDataExport = {
  format: typeof PERSONAL_DATA_EXPORT_FORMAT;
  exportedAt: string;
  account: PersonalDataRecord;
  /** One array per kind of record; an empty array means none exist. */
  sections: Record<string, PersonalDataRecord[]>;
};
