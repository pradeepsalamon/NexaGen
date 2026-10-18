import { BadRequestException } from "@nestjs/common";
import {
  assertWithinBatchDates,
  batchClassWindow,
  isDayWithinBatchDates,
  isWithinBatchDates
} from "./batch-dates";

// Date-only columns come back from Prisma as UTC midnight.
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const batch = { startsAt: day("2026-09-01"), endsAt: day("2026-09-30") };

describe("batch date range", () => {
  it("covers the first and last day in full, in the academy's zone", () => {
    const { from, until } = batchClassWindow(batch, "Asia/Kolkata");
    // IST is UTC+5:30, so local midnight is 18:30 UTC the previous day.
    expect(from?.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(until?.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("accepts a class on the last evening and refuses one the morning after", () => {
    expect(isWithinBatchDates(batch, new Date("2026-09-30T14:00:00.000Z"), "Asia/Kolkata")).toBe(true);
    expect(isWithinBatchDates(batch, new Date("2026-09-30T19:00:00.000Z"), "Asia/Kolkata")).toBe(false);
    expect(isWithinBatchDates(batch, new Date("2026-08-31T18:00:00.000Z"), "Asia/Kolkata")).toBe(false);
  });

  it("treats a missing end as open-ended", () => {
    const open = { startsAt: day("2026-09-01"), endsAt: null };
    expect(isWithinBatchDates(open, new Date("2030-01-01T10:00:00.000Z"))).toBe(true);
    expect(isDayWithinBatchDates(open, "2026-08-31")).toBe(false);
    expect(isDayWithinBatchDates({ startsAt: null, endsAt: null }, "1999-01-01")).toBe(true);
  });

  it("compares a schedule's local day inclusively", () => {
    expect(isDayWithinBatchDates(batch, "2026-09-01")).toBe(true);
    expect(isDayWithinBatchDates(batch, "2026-09-30")).toBe(true);
    expect(isDayWithinBatchDates(batch, "2026-10-01")).toBe(false);
  });

  it("explains the refusal with the batch's dates", () => {
    expect(() =>
      assertWithinBatchDates({ ...batch, name: "Beginners" }, new Date("2026-10-05T10:00:00.000Z"))
    ).toThrow(new BadRequestException(
      'This class falls outside the batch "Beginners"\'s dates (2026-09-01 – 2026-09-30). Change the batch dates first.'
    ));
  });
});
