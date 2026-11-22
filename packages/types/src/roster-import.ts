import { z } from "zod";

/**
 * Roster import (docs/ROSTER_IMPORT.md): an academy admin uploads students and
 * coaches from a spreadsheet saved as CSV. The browser reads the file and sends
 * the rows; the API checks every row again before it creates anything.
 */

/** Most rows one import may hold. A bigger roster is split into several files. */
export const ROSTER_IMPORT_MAX_ROWS = 1000;

/** The roles a roster import may create. Admins are still made one by one. */
export const rosterImportRoleSchema = z.enum(["STUDENT", "COACH"]);
export type RosterImportRole = z.infer<typeof rosterImportRoleSchema>;

/** Accounts imported without an email get an address on this reserved domain; they can't sign in until one is added. */
export const NO_EMAIL_DOMAIN = "no-email.invalid";

/** True for the stand-in address of an account imported without an email. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const rosterImportRowSchema = z.object({
  /** Exact name (any case) of an existing batch to put the person in. */
  batch: optionalText(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  firstName: z.string().trim().min(1, "First name is required.").max(120),
  lastName: optionalText(120),
  parentEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email("Enter a valid parent email.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  parentName: optionalText(160),
  parentPhone: optionalText(32),
  phone: optionalText(32),
  role: rosterImportRoleSchema.default("STUDENT")
});
export type RosterImportRow = z.infer<typeof rosterImportRowSchema>;
export type RosterImportRowInput = z.input<typeof rosterImportRowSchema>;

export const rosterImportRequestSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, "The file has no rows.").max(ROSTER_IMPORT_MAX_ROWS),
  /** Send an invite email to every new account that has an email. */
  sendInvites: z.boolean().default(true)
});
export type RosterImportRequest = z.input<typeof rosterImportRequestSchema>;

export type RosterImportRowOutcome =
  /** Preview: would be created. Import: created. */
  | "CREATE"
  /** An account with this email already exists in the academy; left as it is. */
  | "EXISTS"
  /** Something in the row is wrong; nothing is made for it. */
  | "INVALID"
  /** The academy's plan has no seat left for this role. */
  | "NO_SEAT";

export type RosterImportRowResult = {
  /** 1-based row number in the file, header excluded. */
  row: number;
  outcome: RosterImportRowOutcome;
  /** Why the row was skipped, in plain words. */
  messages: string[];
  firstName: string;
  lastName: string | null;
  email: string | null;
  role: RosterImportRole | null;
  batchName: string | null;
  /** Import only: the new account. */
  userId?: string;
  /** Import only: an invite email was queued. */
  invited?: boolean;
};

export type RosterImportResponse = {
  dryRun: boolean;
  counts: Record<RosterImportRowOutcome, number>;
  rows: RosterImportRowResult[];
};

export type ResendInviteResponse = { sent: boolean };

// ── CSV reading ────────────────────────────────────────────────────────────

/** Header spellings the import understands, after lower-casing and dropping spaces, `_` and `-`. */
const HEADER_ALIASES: Record<keyof RosterImportRowInput, string[]> = {
  batch: ["batch", "batchname", "class", "group"],
  email: ["email", "emailaddress", "mail", "studentemail", "coachemail"],
  firstName: ["firstname", "first", "givenname", "name", "studentname", "fullname"],
  lastName: ["lastname", "last", "surname", "familyname"],
  parentEmail: ["parentemail", "guardianemail"],
  parentName: ["parentname", "guardianname", "parent", "guardian"],
  parentPhone: ["parentphone", "guardianphone", "parentmobile", "parentwhatsapp"],
  phone: ["phone", "phonenumber", "mobile", "whatsapp", "contact"],
  role: ["role", "type", "accounttype"]
};

/** Columns of the downloadable template, in order. */
export const ROSTER_IMPORT_TEMPLATE_HEADERS = [
  "First name",
  "Last name",
  "Email",
  "Role",
  "Phone",
  "Parent name",
  "Parent email",
  "Parent phone",
  "Batch"
] as const;

export const ROSTER_IMPORT_TEMPLATE_CSV = `${ROSTER_IMPORT_TEMPLATE_HEADERS.join(",")}
Asha,Kumar,asha@example.com,Student,,Ravi Kumar,ravi@example.com,+919800000000,Beginners A
Vikram,Rao,vikram.coach@example.com,Coach,+919811111111,,,,Beginners A
`;

function normalizeHeader(value: string): string {
  return value.replace(/^﻿/, "").toLowerCase().replace(/[\s_\-.]/g, "");
}

/**
 * Reads CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF, a
 * leading BOM) into rows of cells. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export type RosterCsvReadResult = {
  /** Rows keyed by the import's field names; unknown columns are dropped. */
  rows: Record<string, string>[];
  /** Header cells the import didn't recognise (shown so the admin can rename them). */
  ignoredColumns: string[];
  /** Problems with the file as a whole; when set, nothing should be sent. */
  fileErrors: string[];
};

/** Maps a CSV file's header row onto the import's fields and returns the data rows. */
export function readRosterCsv(text: string): RosterCsvReadResult {
  const table = parseCsv(text);
  if (table.length === 0) return { fileErrors: ["The file is empty."], ignoredColumns: [], rows: [] };
  const [header, ...body] = table;
  const fieldByColumn: Array<keyof RosterImportRowInput | null> = header.map((cell) => {
    const key = normalizeHeader(cell);
    const match = (Object.keys(HEADER_ALIASES) as Array<keyof RosterImportRowInput>).find((field) =>
      HEADER_ALIASES[field].includes(key)
    );
    return match ?? null;
  });
  const seen = new Set<string>();
  const fileErrors: string[] = [];
  fieldByColumn.forEach((field, index) => {
    if (!field) return;
    if (seen.has(field)) fileErrors.push(`Two columns mean the same thing: "${header[index]}".`);
    seen.add(field);
  });
  if (!seen.has("firstName")) fileErrors.push('The file needs a "First name" column.');
  if (body.length === 0) fileErrors.push("The file has a header but no rows.");
  if (body.length > ROSTER_IMPORT_MAX_ROWS) {
    fileErrors.push(`One file can hold up to ${ROSTER_IMPORT_MAX_ROWS} people; this one has ${body.length}. Split it into smaller files.`);
  }
  const ignoredColumns = header.filter((cell, index) => !fieldByColumn[index] && cell.trim() !== "");
  const rows = body.map((cells) => {
    const row: Record<string, string> = {};
    fieldByColumn.forEach((field, index) => {
      if (field) row[field] = (cells[index] ?? "").trim();
    });
    return row;
  });
  return { fileErrors, ignoredColumns, rows };
}

/** "Student", "students", "coach", "Teacher" → the role; anything else is null. Blank means student. */
export function readRosterRole(value: unknown): RosterImportRole | null {
  if (value === undefined || value === null) return "STUDENT";
  const text = String(value).trim().toLowerCase();
  if (text === "" || text === "student" || text === "students" || text === "learner") return "STUDENT";
  if (text === "coach" || text === "coaches" || text === "teacher" || text === "trainer") return "COACH";
  return null;
}

export type RosterRowCheck =
  | { ok: true; row: RosterImportRow }
  | { ok: false; messages: string[]; firstName: string; lastName: string | null; email: string | null };

/**
 * The checks that need no database: required fields, formats, role words and
 * an email used twice in the same file. The API runs the same function, then
 * the checks that need the academy's data (existing accounts, batches, seats).
 */
export function checkRosterRows(rawRows: Array<Record<string, unknown>>): RosterRowCheck[] {
  const emailCounts = new Map<string, number>();
  for (const raw of rawRows) {
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }
  return rawRows.map((raw) => {
    const role = readRosterRole(raw.role);
    const parsed = rosterImportRowSchema.safeParse({ ...raw, role: role ?? "STUDENT" });
    const messages: string[] = [];
    if (role === null) messages.push(`Role "${String(raw.role)}" isn't Student or Coach.`);
    if (!parsed.success) messages.push(...parsed.error.issues.map((issue) => issue.message));
    const email = parsed.success ? parsed.data.email : typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (email && (emailCounts.get(email) ?? 0) > 1) messages.push("This email is on more than one row of the file.");
    if (email && isPlaceholderEmail(email)) messages.push("Use the person's real email, or leave it empty.");
    if (parsed.success && messages.length === 0) return { ok: true, row: parsed.data };
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
    return {
      email: email || null,
      firstName: text(raw.firstName) ?? "",
      lastName: text(raw.lastName),
      messages,
      ok: false
    };
  });
}
