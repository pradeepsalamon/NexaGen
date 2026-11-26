import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AI_REVIEW_CONSENT_VERSION } from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { PlanRestrictionException } from "../platform/plan-restriction.exception";
import { runInTenant } from "../tenancy/tenant-context";
import { AiReviewConsentService } from "./ai-review-consent.service";

jest.mock("../auth/authenticate", () => ({ authenticateUser: jest.fn() }));
const authenticate = authenticateUser as jest.MockedFunction<typeof authenticateUser>;

const student = { id: "s1", role: "STUDENT" };
const coach = { id: "c1", role: "COACH" };
const admin = { id: "a1", role: "ADMIN" };

function setup(options: { hasFeature?: boolean; latest?: Record<string, unknown> | null; coachShares?: boolean; providerConfigured?: boolean } = {}) {
  const tx = {
    aiPlayComment: { deleteMany: jest.fn() },
    aiReviewConsent: { create: jest.fn() }
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    aiPlayReviewSettings: { findUnique: jest.fn(async () => ({ engineReviewEnabled: true, outsideAiEnabled: true })), upsert: jest.fn() },
    aiReviewConsent: {
      findMany: jest.fn(async () =>
        options.latest === null || options.latest === undefined
          ? []
          : [{ changedByRole: "STUDENT", createdAt: new Date("2026-11-24T10:00:00Z"), studentId: "s1", ...options.latest }]
      )
    },
    batchStudent: { findFirst: jest.fn(async () => (options.coachShares === false ? null : { id: "bs1" })) },
    user: { findFirst: jest.fn(async () => ({ id: "s1" })) }
  };
  const entitlements = {
    assertFeature: jest.fn(async () => {
      if (options.hasFeature === false) throw PlanRestrictionException.featureRequired("aiPlayReview");
    }),
    hasFeature: jest.fn(async () => options.hasFeature ?? true)
  };
  const groq = { apiKey: "k", model: "m", name: "Groq", provider: "OUTSIDE", providerId: "GROQ", timeoutMs: 1000, url: "https://x" };
  const provider = { comment: jest.fn(), route: () => (options.providerConfigured === false ? [] : [groq]) };
  const service = new AiReviewConsentService({} as never, prisma as never, entitlements as never, provider as never);
  const inAcademy = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);
  return { entitlements, inAcademy, prisma, service, tx };
}

describe("AiReviewConsentService", () => {
  afterEach(() => authenticate.mockReset());

  it("a student switches it on with a guardian's agreement, recorded with the current version", async () => {
    authenticate.mockResolvedValue(student as never);
    const { inAcademy, service, tx } = setup();
    await inAcademy(() => service.setMine("t", { allowed: true, guardianConfirmed: true }));
    expect(tx.aiReviewConsent.create).toHaveBeenCalledWith({
      data: {
        allowed: true,
        changedById: "s1",
        changedByRole: "STUDENT",
        guardianConfirmed: true,
        // The providers shown to the student: play goes only to these.
        providers: ["GROQ"],
        studentId: "s1",
        version: AI_REVIEW_CONSENT_VERSION
      }
    });
    expect(tx.aiPlayComment.deleteMany).not.toHaveBeenCalled();
  });

  it("switching off deletes the outside AI's comments in the same transaction, even without the plan", async () => {
    authenticate.mockResolvedValue(student as never);
    const { entitlements, inAcademy, service, tx } = setup({ hasFeature: false });
    await inAcademy(() => service.setMine("t", { allowed: false }));
    expect(entitlements.assertFeature).not.toHaveBeenCalled();
    expect(tx.aiReviewConsent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ allowed: false, guardianConfirmed: false, providers: [] })
    });
    expect(tx.aiPlayComment.deleteMany).toHaveBeenCalledWith({ where: { studentId: "s1" } });
  });

  it("switching on needs the plan feature (402)", async () => {
    authenticate.mockResolvedValue(student as never);
    const { inAcademy, service, tx } = setup({ hasFeature: false });
    await expect(inAcademy(() => service.setMine("t", { allowed: true, guardianConfirmed: true }))).rejects.toBeInstanceOf(
      PlanRestrictionException
    );
    expect(tx.aiReviewConsent.create).not.toHaveBeenCalled();
  });

  it("only a student has their own switch", async () => {
    authenticate.mockResolvedValue(coach as never);
    const { inAcademy, service } = setup();
    await expect(inAcademy(() => service.getMine("t"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("their coach may switch it after a parent agreed, recorded as the coach", async () => {
    authenticate.mockResolvedValue(coach as never);
    const { inAcademy, service, tx } = setup();
    await inAcademy(() => service.setFor("t", "s1", { allowed: true, guardianConfirmed: true }));
    expect(tx.aiReviewConsent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ changedById: "c1", changedByRole: "COACH", studentId: "s1" }) });
  });

  it("a coach who doesn't teach the student can't", async () => {
    authenticate.mockResolvedValue(coach as never);
    const { inAcademy, service, tx } = setup({ coachShares: false });
    await expect(inAcademy(() => service.setFor("t", "s1", { allowed: true, guardianConfirmed: true }))).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(tx.aiReviewConsent.create).not.toHaveBeenCalled();
  });

  it("an admin of another academy gets a 404 for the student", async () => {
    authenticate.mockResolvedValue(admin as never);
    const { inAcademy, prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue(null as never);
    await expect(inAcademy(() => service.getFor("t", "other-academy-student"))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("a student can't use the staff route for themselves", async () => {
    authenticate.mockResolvedValue(student as never);
    const { inAcademy, service } = setup();
    await expect(inAcademy(() => service.setFor("t", "s1", { allowed: true, guardianConfirmed: true }))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("reports the state and why it's idle", async () => {
    authenticate.mockResolvedValue(student as never);
    const on = setup({ latest: { allowed: true, providers: ["GROQ"], version: AI_REVIEW_CONSENT_VERSION } });
    await expect(on.inAcademy(() => on.service.getMine("t"))).resolves.toMatchObject({
      active: true,
      allowed: true,
      needsReconsent: false,
      providerName: "Groq"
    });

    const noKey = setup({ latest: { allowed: true, providers: ["GROQ"], version: AI_REVIEW_CONSENT_VERSION }, providerConfigured: false });
    await expect(noKey.inAcademy(() => noKey.service.getMine("t"))).resolves.toMatchObject({ active: false, allowed: true, providerConfigured: false });

    // Agreed when only Gemini was used; the platform now uses Groq: asked again, nothing sent.
    const otherProvider = setup({ latest: { allowed: true, providers: ["GEMINI"], version: AI_REVIEW_CONSENT_VERSION } });
    await expect(otherProvider.inAcademy(() => otherProvider.service.getMine("t"))).resolves.toMatchObject({
      active: false,
      allowed: false,
      needsReconsent: true
    });

    const old = setup({ latest: { allowed: true, providers: ["GROQ"], version: AI_REVIEW_CONSENT_VERSION - 1 } });
    await expect(old.inAcademy(() => old.service.getMine("t"))).resolves.toMatchObject({ active: false, allowed: false, needsReconsent: true });
  });

  it("academy settings are admins only", async () => {
    authenticate.mockResolvedValue(coach as never);
    const { inAcademy, service } = setup();
    await expect(inAcademy(() => service.updateSettings("t", { outsideAiEnabled: true }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
