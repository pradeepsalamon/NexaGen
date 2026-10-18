import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  controllers: [ChatController],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [ChatService],
})
export class ChatModule {}
