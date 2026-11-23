import { SubscriptionStatus } from "@prisma/client";
import { allowedSubscriptionMove } from "./subscription.service";

// Review P3: a webhook only moves a subscription along, never back.
describe("allowedSubscriptionMove", () => {
  const { ACTIVE, CANCELLED, CREATED, EXPIRED, PAST_DUE, PAUSED, PENDING_ACTIVATION } = SubscriptionStatus;

  it("moves forward", () => {
    expect(allowedSubscriptionMove(CREATED, PENDING_ACTIVATION)).toBe(true);
    expect(allowedSubscriptionMove(PENDING_ACTIVATION, ACTIVE)).toBe(true);
    expect(allowedSubscriptionMove(ACTIVE, CANCELLED)).toBe(true);
    expect(allowedSubscriptionMove(CREATED, EXPIRED)).toBe(true);
  });

  it("moves between active, past due and paused", () => {
    expect(allowedSubscriptionMove(ACTIVE, PAST_DUE)).toBe(true);
    expect(allowedSubscriptionMove(PAST_DUE, ACTIVE)).toBe(true);
    expect(allowedSubscriptionMove(ACTIVE, PAUSED)).toBe(true);
  });

  it("never goes back to an earlier stage", () => {
    expect(allowedSubscriptionMove(ACTIVE, CREATED)).toBe(false);
    expect(allowedSubscriptionMove(PAST_DUE, PENDING_ACTIVATION)).toBe(false);
  });

  it("never reopens a cancelled or expired subscription", () => {
    expect(allowedSubscriptionMove(CANCELLED, ACTIVE)).toBe(false);
    expect(allowedSubscriptionMove(EXPIRED, CANCELLED)).toBe(false);
  });

  it("ignores no status", () => {
    expect(allowedSubscriptionMove(ACTIVE, null)).toBe(false);
  });
});
