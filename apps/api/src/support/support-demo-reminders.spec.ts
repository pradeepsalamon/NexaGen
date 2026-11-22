import { demoReminderDue, demoTemplateButtons } from "./support-demo-reminders.service";

describe("demoReminderDue (docs/LEAD_STAGES.md)", () => {
  // A demo on Sat 22 Nov 2026 at 10:00 in India = 04:30 UTC; the evening before is Fri 19:00 IST = 13:30 UTC.
  const startsAt = new Date("2026-11-22T04:30:00.000Z");
  const booking = { createdAt: new Date("2026-11-19T10:00:00.000Z"), eveningReminderAt: null, hourReminderAt: null, startsAt, timeZone: "Asia/Kolkata" };
  const at = (iso: string) => new Date(iso);

  it("sends the evening one from 7 pm local the day before, for four hours", () => {
    expect(demoReminderDue(booking, at("2026-11-21T13:29:00.000Z"))).toBeNull();
    expect(demoReminderDue(booking, at("2026-11-21T13:30:00.000Z"))).toBe("EVENING");
    expect(demoReminderDue(booking, at("2026-11-21T17:29:00.000Z"))).toBe("EVENING");
    expect(demoReminderDue(booking, at("2026-11-21T17:30:00.000Z"))).toBeNull();
  });

  it("skips the evening one for a booking made after 7 pm, or already sent", () => {
    expect(demoReminderDue({ ...booking, createdAt: at("2026-11-21T14:00:00.000Z") }, at("2026-11-21T14:05:00.000Z"))).toBeNull();
    expect(demoReminderDue({ ...booking, eveningReminderAt: at("2026-11-21T13:30:00.000Z") }, at("2026-11-21T14:00:00.000Z"))).toBeNull();
  });

  it("sends the hour one between 60 and 10 minutes before, once", () => {
    expect(demoReminderDue(booking, at("2026-11-22T03:29:00.000Z"))).toBeNull();
    expect(demoReminderDue(booking, at("2026-11-22T03:30:00.000Z"))).toBe("HOUR");
    expect(demoReminderDue({ ...booking, eveningReminderAt: at("2026-11-21T13:30:00.000Z") }, at("2026-11-22T04:15:00.000Z"))).toBe("HOUR");
    expect(demoReminderDue(booking, at("2026-11-22T04:21:00.000Z"))).toBeNull();
    expect(demoReminderDue({ ...booking, hourReminderAt: at("2026-11-22T03:30:00.000Z") }, at("2026-11-22T03:40:00.000Z"))).toBeNull();
  });
});

describe("demoTemplateButtons", () => {
  const reminder = {
    buttons: [
      { text: "Yes, I'll attend", type: "QUICK_REPLY" },
      { text: "Reschedule", type: "QUICK_REPLY" },
      { text: "Join demo", type: "URL", url: "https://nexachess.in/demo/{{1}}" }
    ]
  };

  it("fills each quick reply with the next payload and the join button with the class and invite", () => {
    expect(demoTemplateButtons(reminder, ["demo.attend.r1", "demo.move.r1"], "c1?invite=t1")).toEqual([
      { index: "0", parameters: [{ payload: "demo.attend.r1", type: "payload" }], sub_type: "quick_reply", type: "button" },
      { index: "1", parameters: [{ payload: "demo.move.r1", type: "payload" }], sub_type: "quick_reply", type: "button" },
      { index: "2", parameters: [{ text: "c1?invite=t1", type: "text" }], sub_type: "url", type: "button" }
    ]);
  });

  it("refuses when the template needs a join link the booking hasn't got, and falls back to quick replies when unknown", () => {
    expect(demoTemplateButtons(reminder, ["a", "b"], null)).toBeNull();
    expect(demoTemplateButtons({ buttons: [{ text: "Site", type: "URL", url: "https://nexachess.in" }] }, [], null)).toEqual([]);
    expect(demoTemplateButtons(null, ["demo.move.r1"], null)).toEqual([
      { index: "0", parameters: [{ payload: "demo.move.r1", type: "payload" }], sub_type: "quick_reply", type: "button" }
    ]);
  });
});
