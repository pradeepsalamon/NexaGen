import { ConflictException } from "@nestjs/common";
import type { ApprovalRequest } from "@prisma/client";
import { TournamentPublishHandler } from "./tournament-publish.handler";

// Review R10: a stored request that doesn't read back is a 409, never a 500.
describe("TournamentPublishHandler stored request", () => {
  const handler = new TournamentPublishHandler();
  const request = (requestedValue: unknown, currentValue: unknown) =>
    ({ currentValue, id: "req_1", requestedValue, requesterId: "coach_1" }) as unknown as ApprovalRequest;

  it("refuses a request whose snapshot can't be read, with a 409", async () => {
    await expect(handler.revalidate({} as never, request({ tournamentId: "t1" }, { version: "x" }))).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(handler.execute({} as never, request({ nope: 1 }, { version: 1 }), { id: "admin_1" })).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});
