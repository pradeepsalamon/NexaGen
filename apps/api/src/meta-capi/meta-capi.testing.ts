import { MetaCapiService } from "./meta-capi.service";

/** A Conversions API outbox that queues nothing (its calls are recorded), for specs of the lead flows. */
export const NOOP_META_CAPI = {
  provide: MetaCapiService,
  useValue: {
    onLeadCreated: jest.fn(async () => undefined),
    onLeadStatus: jest.fn(async () => undefined)
  }
};
