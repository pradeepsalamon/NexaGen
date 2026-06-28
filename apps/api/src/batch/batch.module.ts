import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { BatchController } from "./batch.controller";
import { BatchService } from "./batch.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [BatchController],
  providers: [BatchService]
})
export class BatchModule {}
