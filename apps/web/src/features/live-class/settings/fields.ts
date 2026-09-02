import type {
  LiveClassSettings,
  LiveClassSettingsOverride,
} from "@nexa-chess/types";

export type SettingsGroup = "media" | "participants" | "classroom";

export interface SettingsFieldDef {
  /** Dot path into LiveClassSettings, e.g. "student.mic" or "recording". */
  path: string;
  group: SettingsGroup;
  label: string;
  help?: string;
  options: { value: string; label: string }[];
  /** Only render for coach/admin editors (not the student pre-join view). */
  advanced?: boolean;
}

const YES_NO = (yes: string, no: string) => [
  { value: no, label: no === "DISABLED" ? "Disabled" : no },
  { value: yes, label: yes === "ENABLED" ? "Enabled" : yes },
];

export const SETTINGS_FIELDS: SettingsFieldDef[] = [
  {
    path: "student.mic",
    group: "media",
    label: "Student microphone",
    help: "Default state and whether students may unmute.",
    options: [
      { value: "JOIN_MUTED", label: "Join muted (can unmute)" },
      { value: "JOIN_UNMUTED", label: "Join unmuted" },
      { value: "FORCED_OFF", label: "Locked off (cannot unmute)" },
    ],
  },
  {
    path: "student.camera",
    group: "media",
    label: "Student camera",
    help: "Default state and whether students may turn it on.",
    options: [
      { value: "JOIN_OFF", label: "Join with camera off" },
      { value: "JOIN_ON", label: "Join with camera on" },
      { value: "FORCED_OFF", label: "Locked off (cannot enable)" },
    ],
  },
  {
    path: "student.screenShare",
    group: "media",
    label: "Student screen share",
    options: [
      { value: "DISABLED", label: "Not allowed" },
      { value: "ALLOWED", label: "Allowed" },
    ],
  },
  {
    path: "student.chat",
    group: "participants",
    label: "Student chat",
    options: [
      { value: "ENABLED", label: "Can chat" },
      { value: "DISABLED", label: "Chat disabled" },
    ],
  },
  {
    path: "student.board",
    group: "participants",
    label: "Chessboard interaction",
    help: "Whether students can move pieces on the shared board by default (the coach can still grant control live).",
    options: [
      { value: "VIEW_ONLY", label: "View only" },
      { value: "INTERACTIVE", label: "Can interact" },
    ],
  },
  {
    path: "coach.mic",
    group: "media",
    label: "Coach microphone",
    advanced: true,
    options: [
      { value: "JOIN_UNMUTED", label: "Join unmuted" },
      { value: "JOIN_MUTED", label: "Join muted" },
    ],
  },
  {
    path: "coach.camera",
    group: "media",
    label: "Coach camera",
    advanced: true,
    options: [
      { value: "JOIN_ON", label: "Join with camera on" },
      { value: "JOIN_OFF", label: "Join with camera off" },
    ],
  },
  {
    path: "autoJoin.student",
    group: "classroom",
    label: "Student auto-join",
    help: "Students enter the classroom automatically once the class is live (falls back to the pre-join screen if the browser blocks devices).",
    options: YES_NO("ENABLED", "DISABLED"),
  },
  {
    path: "autoJoin.coach",
    group: "classroom",
    label: "Coach auto-join",
    advanced: true,
    options: YES_NO("ENABLED", "DISABLED"),
  },
  {
    path: "recording",
    group: "classroom",
    label: "Recording",
    help: "Participants are notified when recording starts.",
    options: [
      { value: "DISABLED", label: "Disabled" },
      { value: "MANUAL", label: "Coach starts it" },
      { value: "AUTO_START", label: "Starts automatically" },
    ],
  },
];

export const GROUP_LABELS: Record<SettingsGroup, string> = {
  media: "Audio & video",
  participants: "Participant permissions",
  classroom: "Classroom",
};

// ── path helpers (2-level shape only) ──

export function getAtPath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function setAtPath(
  override: LiveClassSettingsOverride,
  path: string,
  value: string,
): LiveClassSettingsOverride {
  const parts = path.split(".");
  const next: Record<string, unknown> = { ...(override as Record<string, unknown>) };
  if (parts.length === 1) {
    next[parts[0]] = value;
    return next as LiveClassSettingsOverride;
  }
  const [head, leaf] = parts;
  next[head] = { ...((next[head] as Record<string, unknown>) ?? {}), [leaf]: value };
  return next as LiveClassSettingsOverride;
}

export function unsetAtPath(
  override: LiveClassSettingsOverride,
  path: string,
): LiveClassSettingsOverride {
  const parts = path.split(".");
  const next: Record<string, unknown> = { ...(override as Record<string, unknown>) };
  if (parts.length === 1) {
    delete next[parts[0]];
    return next as LiveClassSettingsOverride;
  }
  const [head, leaf] = parts;
  const section = { ...((next[head] as Record<string, unknown>) ?? {}) };
  delete section[leaf];
  if (Object.keys(section).length === 0) delete next[head];
  else next[head] = section;
  return next as LiveClassSettingsOverride;
}

export function isOverridden(override: LiveClassSettingsOverride, path: string): boolean {
  return getAtPath(override, path) !== undefined;
}

export function optionLabel(field: SettingsFieldDef, value: string | undefined): string {
  return field.options.find((o) => o.value === value)?.label ?? value ?? "—";
}

/** True when the override blob has no keys at all. */
export function isEmptyOverride(override: LiveClassSettingsOverride): boolean {
  return Object.keys(override).length === 0;
}

export function summaryRows(resolved: LiveClassSettings) {
  return SETTINGS_FIELDS.map((f) => ({
    label: f.label,
    value: optionLabel(f, getAtPath(resolved, f.path)),
  }));
}
