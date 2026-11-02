import * as fs from "fs";
import * as path from "path";
import {
  canAutoAdvanceReferral,
  canHoldReferralLink,
  DEFAULT_REFERRAL_STAGES,
  maskProspectName,
  referralCodePrefix,
  referralCodeSchema,
  formatReferralReward,
  referralMilestonesReached,
  referralPointsValueMinor,
  referralRewardRuleProblem,
  referralStagesReached
} from "@nexa-chess/types";

const stage = (id: string, position: number, trigger: (typeof DEFAULT_REFERRAL_STAGES)[number]["trigger"] = "MANUAL") => ({
  id,
  position,
  trigger
});

const visited = stage("visited", 10, "LINK_VISITED");
const booked = stage("booked", 20, "DEMO_BOOKED");
const contacted = stage("contacted", 25);
const attended = stage("attended", 30, "DEMO_ATTENDED");
const converted = stage("converted", 40, "CONVERTED");
const lost = stage("lost", 50, "LOST");
const PIPELINE = [visited, booked, contacted, attended, converted, lost];

describe("referral pipeline rules", () => {
  it("automatic moves only go forward and never leave a final stage", () => {
    expect(canAutoAdvanceReferral(null, visited)).toBe(true);
    expect(canAutoAdvanceReferral(visited, booked)).toBe(true);
    expect(canAutoAdvanceReferral(attended, booked)).toBe(false);
    expect(canAutoAdvanceReferral(booked, booked)).toBe(false);
    expect(canAutoAdvanceReferral(converted, lost)).toBe(false);
    expect(canAutoAdvanceReferral(lost, converted)).toBe(false);
    expect(canAutoAdvanceReferral(attended, lost)).toBe(true);
  });

  it("a jump reaches every earlier non-lost stage; lost reaches only itself", () => {
    expect(referralStagesReached(PIPELINE, converted).map((s) => s.id)).toEqual([
      "visited",
      "booked",
      "contacted",
      "attended",
      "converted"
    ]);
    expect(referralStagesReached(PIPELINE, lost).map((s) => s.id)).toEqual(["lost"]);
    expect(referralStagesReached(PIPELINE, booked).map((s) => s.id)).toEqual(["visited", "booked"]);
  });

  it("milestones are each multiple reached", () => {
    expect(referralMilestonesReached(7, 3)).toEqual([3, 6]);
    expect(referralMilestonesReached(2, 3)).toEqual([]);
    expect(referralMilestonesReached(5, 0)).toEqual([]);
    expect(referralMilestonesReached(4, 2)).toEqual([2, 4]);
  });
});

describe("referral people and codes", () => {
  it("masks a prospect to first name and last initial", () => {
    expect(maskProspectName("Priya Sharma")).toBe("Priya S.");
    expect(maskProspectName("  arjun  kumar rao ")).toBe("arjun R.");
    expect(maskProspectName("Kavya")).toBe("Kavya");
    expect(maskProspectName("")).toBeNull();
    expect(maskProspectName(null)).toBeNull();
  });

  it("builds a readable code prefix and validates codes", () => {
    expect(referralCodePrefix("Pradeep")).toBe("PRADEE");
    expect(referralCodePrefix("Zoë")).toBe("ZOE");
    expect(referralCodePrefix("李")).toBe("NEXA");
    expect(referralCodeSchema.parse(" ab12cd ")).toBe("AB12CD");
    expect(referralCodeSchema.safeParse("AB-12").success).toBe(false);
  });

  it("SALES always holds a link while the programme is on", () => {
    expect(canHoldReferralLink("SALES", { enabled: true, referrerRoles: [] })).toBe(true);
    expect(canHoldReferralLink("SALES", { enabled: false, referrerRoles: ["SALES"] })).toBe(false);
    expect(canHoldReferralLink("STUDENT", { enabled: true, referrerRoles: ["COACH"] })).toBe(false);
    expect(canHoldReferralLink("COACH", { enabled: true, referrerRoles: ["COACH"] })).toBe(true);
    expect(canHoldReferralLink("ADMIN", { enabled: true, referrerRoles: ["STUDENT", "COACH"] })).toBe(false);
  });
});

describe("the referral_program migration", () => {
  it("seeds exactly DEFAULT_REFERRAL_STAGES", () => {
    const dir = path.resolve(__dirname, "../../prisma/migrations");
    const folder = fs.readdirSync(dir).find((name) => name.endsWith("_referral_program"));
    const sql = fs.readFileSync(path.join(dir, folder!, "migration.sql"), "utf8");
    for (const s of DEFAULT_REFERRAL_STAGES) {
      const row = new RegExp(`\\('${s.id}',\\s*'${s.name}',\\s*'([^']*)',\\s*'${s.tone}',\\s*${s.position},\\s*'${s.trigger}'`).exec(sql);
      expect(row?.[1]).toBe(s.description);
    }
  });
});

describe("referral points and benefits", () => {
  it("values points at the admin rate, rounding down", () => {
    const rate = { conversionPoints: 10, conversionValueMinor: 100 };
    expect(referralPointsValueMinor(150, rate)).toBe(1500);
    expect(referralPointsValueMinor(7, { conversionPoints: 3, conversionValueMinor: 1 })).toBe(2);
    expect(referralPointsValueMinor(0, rate)).toBe(0);
    expect(referralPointsValueMinor(10, { conversionPoints: 0, conversionValueMinor: 100 })).toBe(0);
  });

  it("refuses reward-rule shapes that make no sense", () => {
    const base = { amountMinor: 10, beneficiary: "REFERRER", kind: "PER_REFERRAL", milestoneCount: null, unit: "CASH" } as const;
    expect(referralRewardRuleProblem(base)).toBeNull();
    expect(referralRewardRuleProblem({ ...base, kind: "MILESTONE" })?.path).toBe("milestoneCount");
    expect(referralRewardRuleProblem({ ...base, unit: "DISCOUNT_PERCENT" })?.path).toBe("unit");
    expect(referralRewardRuleProblem({ ...base, beneficiary: "REFERRED", kind: "MILESTONE", milestoneCount: 3 })?.path).toBe("kind");
    expect(referralRewardRuleProblem({ ...base, amountMinor: 101, beneficiary: "REFERRED", unit: "DISCOUNT_PERCENT" })?.path).toBe("amountMinor");
    expect(referralRewardRuleProblem({ ...base, beneficiary: "REFERRED", unit: "DISCOUNT_PERCENT" })).toBeNull();
  });

  it("formats each reward unit", () => {
    expect(formatReferralReward(250, "POINTS", "INR")).toBe("250 points");
    expect(formatReferralReward(1, "POINTS", "INR")).toBe("1 point");
    expect(formatReferralReward(15, "DISCOUNT_PERCENT", "INR")).toBe("15% off");
    expect(formatReferralReward(50000, "CASH", "INR")).toContain("500");
  });
});
