import { Module } from "@nestjs/common";
import { LiveClassController } from "./live-class.controller";
import { LiveClassService } from "./live-class.service";
import { LiveKitService } from "./livekit.service";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [LiveClassController],
  providers: [LiveClassService, LiveKitService],
  exports: [LiveClassService, LiveKitService]
})
export class LiveClassModule {}
