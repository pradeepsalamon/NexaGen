import { nextLeadStatus } from "@nexa-chess/types";

describe("nextLeadStatus (automatic stage moves)", () => {
  it("moves a lead through the demo", () => {
    expect(nextLeadStatus("NEW", "DEMO_BOOKED")).toBe("DEMO_SCHEDULED");
    expect(nextLeadStatus("DEMO_SCHEDULED", "DEMO_CONFIRMED")).toBe("DEMO_CONFIRMED");
    expect(nextLeadStatus("DEMO_CONFIRMED", "DEMO_ATTENDED")).toBe("DEMO_ATTENDED");
    expect(nextLeadStatus("DEMO_CONFIRMED", "DEMO_MISSED")).toBe("NO_SHOW");
    expect(nextLeadStatus("DEMO_SCHEDULED", "DEMO_MISSED")).toBe("NO_SHOW");
  });

  it("lets a lead who missed a demo be booked again, and a re-booking needs a new confirmation", () => {
    expect(nextLeadStatus("NO_SHOW", "DEMO_BOOKED")).toBe("DEMO_SCHEDULED");
    expect(nextLeadStatus("DEMO_CONFIRMED", "DEMO_BOOKED")).toBe("DEMO_SCHEDULED");
  });

  it("never moves back from a later stage", () => {
    expect(nextLeadStatus("DEMO_ATTENDED", "DEMO_BOOKED")).toBeNull();
    expect(nextLeadStatus("FOLLOW_UP", "DEMO_BOOKED")).toBeNull();
    expect(nextLeadStatus("PAYMENT_PENDING", "DEMO_MISSED")).toBeNull();
    expect(nextLeadStatus("DEMO_ATTENDED", "DEMO_MISSED")).toBeNull();
    expect(nextLeadStatus("NEW", "DEMO_CONFIRMED")).toBeNull();
    expect(nextLeadStatus("DEMO_SCHEDULED", "DEMO_BOOKED")).toBeNull();
  });

  it("never moves a lead a person closed", () => {
    for (const closed of ["CONVERTED", "ACTIVE_STUDENT", "LOST"] as const) {
      for (const event of ["DEMO_BOOKED", "DEMO_CONFIRMED", "DEMO_ATTENDED", "DEMO_MISSED"] as const) {
        expect(nextLeadStatus(closed, event)).toBeNull();
      }
    }
  });

  it("registering moves an open lead to Payment pending, and enrolment converts it", () => {
    expect(nextLeadStatus("NEW", "REGISTERED")).toBe("PAYMENT_PENDING");
    expect(nextLeadStatus("DEMO_ATTENDED", "REGISTERED")).toBe("PAYMENT_PENDING");
    expect(nextLeadStatus("PAYMENT_PENDING", "REGISTERED")).toBeNull();
    expect(nextLeadStatus("PAYMENT_PENDING", "ENROLLED")).toBe("CONVERTED");
    expect(nextLeadStatus("NEW", "ENROLLED")).toBe("CONVERTED");
    expect(nextLeadStatus("LOST", "REGISTERED")).toBeNull();
    expect(nextLeadStatus("ACTIVE_STUDENT", "ENROLLED")).toBeNull();
  });
});
