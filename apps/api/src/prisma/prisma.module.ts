import { Global, Module } from "@nestjs/common";
import { JobLockService } from "./job-lock.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [JobLockService, PrismaService],
  exports: [JobLockService, PrismaService]
})
export class PrismaModule {}
