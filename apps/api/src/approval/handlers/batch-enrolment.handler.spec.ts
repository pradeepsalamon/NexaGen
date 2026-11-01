import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole, type ApprovalRequest } from "@prisma/client";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import type { TrashRepository } from "../../trash/trash.repository";
import {
  BatchStudentEnrolHandler,
  BatchStudentRemoveHandler,
  BatchStudentTransferHandler
} from "./batch-enrolment.handler";

const coach = { id: "coach-1", role: UserRole.COACH, timezone: "UTC" };
const student = "stu-1";

describe("batch enrolment handlers (Stage 6)", () => {
  let tx: {
    $queryRaw: jest.Mock;
    batchCoach: { findFirst: jest.Mock };
    batchStudent: { findFirst: jest.Mock; upsert: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let trash: { softDelete: jest.Mock };
  const db = () => tx as unknown as PrismaTransactionClient;
  const trashRepo = () => trash as unknown as TrashRepository;

  const request = (over: Partial<ApprovalRequest> = {}) =>
    ({ batchId: "batch-1", requesterId: "coach-1", subjectUserId: student, ...over }) as ApprovalRequest;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      batchCoach: {
        findFirst: jest.fn().mockResolvedValue({ batch: { name: "Batch" }, coach: { timezone: "UTC" } })
      },
      batchStudent: { findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: student }) }
    };
    trash = { softDelete: jest.fn() };
  });

  describe("BATCH_STUDENT_ENROL", () => {
    const handler = new BatchStudentEnrolHandler();
    const payload = { batchId: "batch-1", studentId: student };

    it("asks for an active student who isn't in the coach's batch yet", async () => {
      expect(await handler.prepare(db(), coach, payload)).toMatchObject({
        batchId: "batch-1",
        dedupeKey: `BATCH_STUDENT_ENROL:batch-1:${student}`,
        subjectUserId: student
      });
    });

    it("refuses another coach's batch, an inactive student and someone already enrolled", async () => {
      tx.batchCoach.findFirst.mockResolvedValueOnce(null);
      await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ForbiddenException);

      tx.user.findFirst.mockResolvedValueOnce(null);
      await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(NotFoundException);

      tx.batchStudent.findFirst.mockResolvedValueOnce({ id: "bs-1" });
      await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ConflictException);
    });

    it("revalidation refuses once the coach left the batch or the student joined it", async () => {
      tx.batchCoach.findFirst.mockResolvedValueOnce(null);
      await expect(handler.revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);

      tx.batchStudent.findFirst.mockResolvedValueOnce({ id: "bs-1" });
      await expect(handler.revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
    });

    it("restores an earlier enrolment instead of creating a duplicate", async () => {
      await handler.execute(db(), request());
      expect(tx.batchStudent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ isDeleted: false }),
          where: { batchId_studentId: { batchId: "batch-1", studentId: student } }
        })
      );
    });
  });

  describe("BATCH_STUDENT_REMOVE", () => {
    const payload = { batchId: "batch-1", studentId: student };

    it("refuses a student who isn't in the batch", async () => {
      await expect(new BatchStudentRemoveHandler(trashRepo()).prepare(db(), coach, payload)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("goes through the trash, attributed to the reviewer", async () => {
      tx.batchStudent.findFirst.mockResolvedValue({ id: "bs-1" });
      await new BatchStudentRemoveHandler(trashRepo()).execute(db(), request(), { id: "admin-1" });
      expect(trash.softDelete).toHaveBeenCalledWith(tx, "BatchStudent", "bs-1", "admin-1");
    });
  });

  describe("BATCH_STUDENT_TRANSFER", () => {
    const payload = { fromBatchId: "batch-1", studentId: student, toBatchId: "batch-2" };
    const transferRequest = () => request({ requestedValue: { toBatchId: "batch-2" } });

    it("refuses a destination that isn't the coach's own", async () => {
      tx.batchCoach.findFirst
        .mockResolvedValueOnce({ batch: { name: "Mine" } })
        .mockResolvedValueOnce(null);
      await expect(new BatchStudentTransferHandler(trashRepo()).prepare(db(), coach, payload)).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("records both batch names for the inbox", async () => {
      tx.batchStudent.findFirst.mockResolvedValueOnce({ id: "bs-1" }).mockResolvedValueOnce(null);
      const prepared = await new BatchStudentTransferHandler(trashRepo()).prepare(db(), coach, payload);
      expect(prepared.requestedValue).toEqual({ fromBatchName: "Batch", toBatchId: "batch-2", toBatchName: "Batch" });
    });

    it("revalidation refuses when the student already moved", async () => {
      tx.batchStudent.findFirst.mockResolvedValueOnce(null);
      await expect(
        new BatchStudentTransferHandler(trashRepo()).revalidate(db(), transferRequest())
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("removes from one batch and enrols in the other", async () => {
      tx.batchStudent.findFirst.mockResolvedValue({ id: "bs-1" });
      await new BatchStudentTransferHandler(trashRepo()).execute(db(), transferRequest(), { id: "admin-1" });
      expect(trash.softDelete).toHaveBeenCalledWith(tx, "BatchStudent", "bs-1", "admin-1");
      expect(tx.batchStudent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { batchId_studentId: { batchId: "batch-2", studentId: student } } })
      );
    });
  });
});
