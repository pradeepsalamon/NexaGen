import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable, Writable } from "stream";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  createReadStream: jest.fn(),
}));
import { BadRequestException, NotFoundException } from "@nestjs/common";
import * as configModule from "@nexa-chess/config/api";
import type { ApiEnv } from "@nexa-chess/config/api";
import { RecordingStorageService } from "./recording-storage.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("RecordingStorageService", () => {
  let storageDir: string;
  let service: RecordingStorageService;
  let liveSessionFindMany: jest.Mock;
  let liveSessionUpdate: jest.Mock;

  const setEnv = (overrides: Partial<ApiEnv> = {}) => {
    jest.spyOn(configModule, "getApiEnv").mockReturnValue({
      RECORDING_STORAGE_DIR: storageDir,
      RECORDING_STORAGE_LIMIT_GB: 0.00001, // ~10KB so tests can breach it
      RECORDING_MIN_RETENTION_DAYS: 14,
      ...overrides,
    } as ApiEnv);
  };

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "rec-store-"));
    setEnv();
    liveSessionFindMany = jest.fn().mockResolvedValue([]);
    liveSessionUpdate = jest.fn().mockResolvedValue({});
    service = new RecordingStorageService({
      liveSession: { findMany: liveSessionFindMany, update: liveSessionUpdate },
    } as unknown as PrismaService);
  });

  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe("resolveFilePath", () => {
    it("resolves a bare filename inside the storage dir", () => {
      expect(service.resolveFilePath("room-1.mp4")).toBe(
        path.join(storageDir, "room-1.mp4")
      );
    });

    it("strips a leading recordings/ prefix", () => {
      expect(service.resolveFilePath("recordings/room-1.mp4")).toBe(
        path.join(storageDir, "room-1.mp4")
      );
    });

    it("rejects ../ traversal out of the storage dir", () => {
      expect(() => service.resolveFilePath("../secret.mp4")).toThrow(BadRequestException);
    });

    it("rejects a sibling directory that shares the storage-dir prefix", () => {
      expect(() =>
        service.resolveFilePath(`../${path.basename(storageDir)}-evil/x.mp4`)
      ).toThrow(BadRequestException);
    });

    it("rejects empty / non-string input", () => {
      expect(() => service.resolveFilePath("")).toThrow(BadRequestException);
      // @ts-expect-error deliberate wrong type
      expect(() => service.resolveFilePath(null)).toThrow(BadRequestException);
    });
  });

  describe("getStorageUsageBytes", () => {
    it("returns 0 when the directory does not exist", async () => {
      fs.rmSync(storageDir, { recursive: true, force: true });
      expect(await service.getStorageUsageBytes()).toBe(0);
    });

    it("sums only top-level files", async () => {
      fs.writeFileSync(path.join(storageDir, "a.mp4"), Buffer.alloc(100));
      fs.writeFileSync(path.join(storageDir, "b.mp4"), Buffer.alloc(50));
      fs.mkdirSync(path.join(storageDir, "sub"));
      fs.writeFileSync(path.join(storageDir, "sub", "c.mp4"), Buffer.alloc(999));
      expect(await service.getStorageUsageBytes()).toBe(150);
    });
  });

  describe("pruneOldestRecordings", () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

    it("deletes recordings older than the retention window, oldest first", async () => {
      fs.writeFileSync(path.join(storageDir, "old.mp4"), Buffer.alloc(100));
      liveSessionFindMany.mockResolvedValue([
        { id: "s1", recordingUrl: "recordings/old.mp4", createdAt: daysAgo(30), metadata: {} },
      ]);

      const freed = await service.pruneOldestRecordings(50);

      expect(freed).toBe(100);
      expect(fs.existsSync(path.join(storageDir, "old.mp4"))).toBe(false);
      expect(liveSessionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s1" },
          data: expect.objectContaining({ recordingUrl: null }),
        })
      );
    });

    it("never selects recordings inside the retention window", async () => {
      await service.pruneOldestRecordings(9999);
      const where = liveSessionFindMany.mock.calls[0][0].where;
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      expect(where.createdAt.lt.getTime()).toBeLessThan(daysAgo(13).getTime());
    });

    it("stops once the target is met", async () => {
      fs.writeFileSync(path.join(storageDir, "a.mp4"), Buffer.alloc(100));
      fs.writeFileSync(path.join(storageDir, "b.mp4"), Buffer.alloc(100));
      liveSessionFindMany.mockResolvedValue([
        { id: "s1", recordingUrl: "recordings/a.mp4", createdAt: daysAgo(40), metadata: {} },
        { id: "s2", recordingUrl: "recordings/b.mp4", createdAt: daysAgo(39), metadata: {} },
      ]);

      const freed = await service.pruneOldestRecordings(1);
      expect(freed).toBe(100);
      expect(liveSessionUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("ensureStorageCapacity", () => {
    it("does nothing while under quota", async () => {
      setEnv({ RECORDING_STORAGE_LIMIT_GB: 1 });
      await service.ensureStorageCapacity(1);
      expect(liveSessionFindMany).not.toHaveBeenCalled();
    });

    it("prunes when the projected usage breaches the quota", async () => {
      fs.writeFileSync(path.join(storageDir, "old.mp4"), Buffer.alloc(20_000));
      liveSessionFindMany.mockResolvedValue([
        {
          id: "s1",
          recordingUrl: "recordings/old.mp4",
          createdAt: new Date(Date.now() - 40 * 86_400_000),
          metadata: {},
        },
      ]);

      await service.ensureStorageCapacity(1);

      expect(liveSessionFindMany).toHaveBeenCalled();
      expect(fs.existsSync(path.join(storageDir, "old.mp4"))).toBe(false);
    });
  });

  describe("streamVideoFile", () => {
    // fs.createReadStream is mocked (top of file) so header/range logic is tested
    // deterministically without file-descriptor timing.
    const readStreamSpy = fs.createReadStream as unknown as jest.Mock;
    beforeEach(() => {
      readStreamSpy.mockClear();
      readStreamSpy.mockImplementation(() => Readable.from([]));
    });

    const makeRes = () => {
      const res = new Writable({ write: (_c, _e, cb) => cb() }) as Writable & {
        writeHead: jest.Mock;
        end: jest.Mock;
      };
      res.writeHead = jest.fn();
      res.end = jest.fn(() => res);
      return { res };
    };

    it("throws NotFound when the file is absent", async () => {
      const { res } = makeRes();
      await expect(
        service.streamVideoFile("missing.mp4", { headers: {} } as never, res as never)
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("serves the whole file with 200 when there is no Range header", async () => {
      fs.writeFileSync(path.join(storageDir, "v.mp4"), Buffer.alloc(500));
      const { res } = makeRes();

      await service.streamVideoFile("v.mp4", { headers: {} } as never, res as never);

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ "Content-Length": 500, "Accept-Ranges": "bytes" })
      );
    });

    it("serves a 206 partial response for a Range header", async () => {
      fs.writeFileSync(path.join(storageDir, "v.mp4"), Buffer.alloc(1000));
      const { res } = makeRes();

      await service.streamVideoFile(
        "v.mp4",
        { headers: { range: "bytes=100-199" } } as never,
        res as never
      );

      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({
          "Content-Range": "bytes 100-199/1000",
          "Content-Length": 100,
        })
      );
      expect(readStreamSpy).toHaveBeenCalledWith(
        expect.stringContaining("v.mp4"),
        { start: 100, end: 199 }
      );
    });

    it("handles an open-ended range", async () => {
      fs.writeFileSync(path.join(storageDir, "v.mp4"), Buffer.alloc(1000));
      const { res } = makeRes();

      await service.streamVideoFile(
        "v.mp4",
        { headers: { range: "bytes=900-" } } as never,
        res as never
      );

      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({ "Content-Range": "bytes 900-999/1000" })
      );
    });

    it("handles a suffix range (last N bytes)", async () => {
      fs.writeFileSync(path.join(storageDir, "v.mp4"), Buffer.alloc(1000));
      const { res } = makeRes();

      await service.streamVideoFile(
        "v.mp4",
        { headers: { range: "bytes=-100" } } as never,
        res as never
      );

      expect(res.writeHead).toHaveBeenCalledWith(
        206,
        expect.objectContaining({ "Content-Range": "bytes 900-999/1000" })
      );
    });

    it("replies 416 for an unsatisfiable range", async () => {
      fs.writeFileSync(path.join(storageDir, "v.mp4"), Buffer.alloc(100));
      const { res } = makeRes();

      await service.streamVideoFile(
        "v.mp4",
        { headers: { range: "bytes=500-600" } } as never,
        res as never
      );

      expect(res.writeHead).toHaveBeenCalledWith(
        416,
        expect.objectContaining({ "Content-Range": "bytes */100" })
      );
      expect(res.end).toHaveBeenCalled();
      expect(readStreamSpy).not.toHaveBeenCalled();
    });
  });
});
