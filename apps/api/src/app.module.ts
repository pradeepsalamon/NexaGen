import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { BatchModule } from "./batch/batch.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, AuthModule, BatchModule]
})
export class AppModule {}
