import { LeadStageService } from "./lead-stage.service";

/** A stage service that moves nothing (its calls are recorded), for specs of the demo-class and live-class flows. */
export const NOOP_LEAD_STAGES = {
  provide: LeadStageService,
  useValue: {
    apply: jest.fn(async () => null),
    applyQuietly: jest.fn(async () => undefined)
  }
};
