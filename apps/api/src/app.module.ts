import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { BatchModule } from "./batch/batch.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TrashModule } from "./trash/trash.module";
import { UserModule } from "./user/user.module";

@Module({
  imports: [PrismaModule, AuthModule, BatchModule, TrashModule, UserModule]
})
export class AppModule {}
