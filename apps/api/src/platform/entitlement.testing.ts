import { EntitlementService } from "./entitlement.service";

/** For specs of services that check plan limits: every check passes. */
export const UNLIMITED_ENTITLEMENTS = {
  provide: EntitlementService,
  useValue: {
    assertCanCreateBatch: async () => undefined,
    assertCanStartLiveClass: async () => undefined,
    assertFeature: async () => undefined,
    assertSeatAvailable: async () => undefined,
    hasFeature: async () => true
  }
};
