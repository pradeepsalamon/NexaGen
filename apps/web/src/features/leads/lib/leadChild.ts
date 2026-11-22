import { leadChildDetailsGiven } from "@nexa-chess/types";

/** Shown where a captured WhatsApp lead has no child details yet (`LEAD_DETAILS_NOT_GIVEN`). */
export const NOT_GIVEN = "—";

/** The student's name and "Age 8 · beginner" line, or "—" for a lead captured from a WhatsApp chat. */
export function leadChildLines(lead: { experienceLevel: string; studentAge: number; studentName: string }): { meta: string; name: string } {
  if (!leadChildDetailsGiven(lead)) return { meta: "Child details not given yet", name: NOT_GIVEN };
  return { meta: `Age ${lead.studentAge} · ${lead.experienceLevel}`, name: lead.studentName };
}
