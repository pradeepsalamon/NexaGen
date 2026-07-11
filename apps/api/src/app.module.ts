import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { BatchModule } from "./batch/batch.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TrashModule } from "./trash/trash.module";
import { UserModule } from "./user/user.module";
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule, 
    AuthModule, 
    BatchModule, 
    TrashModule, 
    UserModule, AdminModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ]
})
export class AppModule {}
