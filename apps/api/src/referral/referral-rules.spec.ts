import * as fs from "fs";
import * as path from "path";
import {
  referralPointsExpired,
  canAutoAdvanceReferral,
  canHoldReferralLink,
  DEFAULT_REFERRAL_STAGES,
  maskProspectName,
  referralCodePrefix,
  referralCodeSchema,
  formatReferralReward,
  formatReferralVoucherValue,
  REFERRAL_BONUS_AUDIENCES,
  referralBonusAudienceOf,
  referralBonusAudienceTarget,
  referralMilestonesReached,
  referralStagesReached,
  referralVoucherProblem,
  referralWalletForRole,
  referrerStageReward
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

describe("referral earning", () => {
  const values = { coachCashMinor: 20000, salesCashMinor: 30000, studentPoints: 150 };

  it("students earn points, coaches and SALES earn money", () => {
    expect(referralWalletForRole("STUDENT")).toBe("POINTS");
    expect(referralWalletForRole("COACH")).toBe("CASH");
    expect(referrerStageReward(values, "STUDENT")).toEqual({ amount: 150, wallet: "POINTS" });
    expect(referrerStageReward(values, "COACH")).toEqual({ amount: 20000, wallet: "CASH" });
    expect(referrerStageReward(values, "SALES")).toEqual({ amount: 30000, wallet: "CASH" });
    expect(referrerStageReward({ ...values, studentPoints: 0 }, "STUDENT")).toBeNull();
    expect(referrerStageReward(values, "ADMIN")).toBeNull();
  });

  it("a bonus audience round-trips through roles + unit, and nothing else is a bonus", () => {
    for (const audience of REFERRAL_BONUS_AUDIENCES) {
      const target = referralBonusAudienceTarget(audience);
      expect(referralBonusAudienceOf(target.roles, target.wallet)).toBe(audience);
    }
    expect(referralBonusAudienceOf(["STUDENT"], "CASH")).toBeNull();
    expect(referralBonusAudienceOf([], "CASH")).toBeNull();
    expect(referralBonusAudienceOf(["STUDENT", "COACH"], "POINTS")).toBeNull();
    expect(referralBonusAudienceOf(["SALES", "COACH"], "CASH")).toBe("STAFF");
  });

  it("formats each reward unit", () => {
    expect(formatReferralReward(250, "POINTS", "INR")).toBe("250 points");
    expect(formatReferralReward(1, "POINTS", "INR")).toBe("1 point");
    expect(formatReferralReward(15, "DISCOUNT_PERCENT", "INR")).toBe("15% off");
    expect(formatReferralReward(50000, "CASH", "INR")).toContain("500");
  });
});

describe("referral vouchers", () => {
  const percent = { percentOff: 20, type: "PERCENT_DISCOUNT" } as const;

  it("refuses voucher shapes that make no sense", () => {
    expect(referralVoucherProblem(percent)).toBeNull();
    expect(referralVoucherProblem({ type: "PERCENT_DISCOUNT" })?.path).toBe("percentOff");
    expect(referralVoucherProblem({ type: "FIXED_DISCOUNT" })?.path).toBe("amountOffMinor");
    expect(referralVoucherProblem({ type: "FREE_DAYS" })?.path).toBe("freeDays");
    expect(referralVoucherProblem({ amountOffMinor: 500, maxDiscountMinor: 100, type: "FIXED_DISCOUNT" })?.path).toBe("maxDiscountMinor");
    expect(referralVoucherProblem({ freeDays: 7, minOrderMinor: 100, type: "FREE_DAYS" })?.path).toBe("minOrderMinor");
    expect(referralVoucherProblem({ amountOffMinor: 50000, minOrderMinor: 10000, type: "FIXED_DISCOUNT" })?.path).toBe("amountOffMinor");
    expect(
      referralVoucherProblem({ ...percent, endsAt: "2026-01-01T00:00:00.000Z", startsAt: "2026-02-01T00:00:00.000Z" })?.path
    ).toBe("endsAt");
  });

  it("describes what a voucher gives", () => {
    const none = { amountOffMinor: null, freeDays: null, maxDiscountMinor: null, minOrderMinor: null, percentOff: null };
    expect(formatReferralVoucherValue({ ...none, freeDays: 30, type: "FREE_DAYS" }, "INR")).toBe("1 month free");
    expect(formatReferralVoucherValue({ ...none, freeDays: 14, type: "FREE_DAYS" }, "INR")).toBe("2 weeks free");
    expect(formatReferralVoucherValue({ ...none, freeDays: 3, type: "FREE_DAYS" }, "INR")).toBe("3 days free");
    const text = formatReferralVoucherValue({ ...none, maxDiscountMinor: 50000, minOrderMinor: 100000, percentOff: 20, type: "PERCENT_DISCOUNT" }, "INR");
    expect(text).toMatch(/^20% off \(up to .*500.*\) on fees of .*1,000.* or more$/);
    expect(formatReferralVoucherValue({ ...none, amountOffMinor: 50000, type: "FIXED_DISCOUNT" }, "INR")).toMatch(/500.* off$/);
  });
});

describe("referral points expiry", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  const cutoff = day(10);

  it("expires what is left of the points earned before the cutoff", () => {
    expect(referralPointsExpired([{ amountMinor: 100, createdAt: day(1) }], cutoff)).toBe(100);
    expect(referralPointsExpired([{ amountMinor: 100, createdAt: day(10) }], cutoff)).toBe(0);
    expect(referralPointsExpired([{ amountMinor: 100, createdAt: day(20) }], cutoff)).toBe(0);
  });

  it("counts spending against the oldest points first, whenever it happened", () => {
    const entries = [
      { amountMinor: 100, createdAt: day(1) },
      { amountMinor: 50, createdAt: day(15) },
      { amountMinor: -120, createdAt: day(16) }
    ];
    // The 120 spent used all 100 old points first, so none of them is left to expire.
    expect(referralPointsExpired(entries, cutoff)).toBe(0);
    expect(referralPointsExpired([...entries.slice(0, 2), { amountMinor: -30, createdAt: day(5) }], cutoff)).toBe(70);
  });

  it("never expires the same points twice, and never goes negative", () => {
    const afterExpiry = [
      { amountMinor: 100, createdAt: day(1) },
      { amountMinor: -100, createdAt: day(11) }
    ];
    expect(referralPointsExpired(afterExpiry, cutoff)).toBe(0);
    expect(referralPointsExpired([{ amountMinor: -40, createdAt: day(1) }], cutoff)).toBe(0);
  });
});
