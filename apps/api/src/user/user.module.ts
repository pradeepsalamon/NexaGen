import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  controllers: [UserController],
  imports: [JwtModule.register({}), MessagingModule, PrismaModule, TrashModule],
  providers: [UserService]
})
export class UserModule { }
