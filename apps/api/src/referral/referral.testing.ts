import { ReferralTrackerService } from "./referral-tracker.service";

/** A tracker that records nothing, for specs of the lead and demo-class flows. */
export const NOOP_REFERRAL_TRACKER = {
  provide: ReferralTrackerService,
  useValue: {
    attachLead: async () => undefined,
    onLeadEvent: async () => undefined,
    onLeadStatus: async () => undefined
  }
};
