import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    // Mock $connect and $disconnect to avoid actual DB connections during unit testing
    service.$connect = jest.fn();
    service.$disconnect = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("onModuleInit", () => {
    it("should call $connect", async () => {
      await service.onModuleInit();
      expect(service.$connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("onModuleDestroy", () => {
    it("should call $disconnect", async () => {
      await service.onModuleDestroy();
      expect(service.$disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("Properties exposure", () => {
    it("should expose prisma model delegates", () => {
      expect(service.user).toBeDefined();
      expect(service.batch).toBeDefined();
      expect(service.authSession).toBeDefined();
      expect(service.studentProfile).toBeDefined();
      expect(service.coachProfile).toBeDefined();
      expect(service.withDeleted).toBeDefined();
    });
  });
});
