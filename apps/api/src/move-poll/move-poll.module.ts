import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassMovePollController } from "./live-class-move-poll.controller";
import { LiveClassMovePollService } from "./live-class-move-poll.service";

@Module({
  controllers: [LiveClassMovePollController],
  imports: [LiveClassModule, PrismaModule],
  // The activity queue asks its question items through the ordinary move poll.
  exports: [LiveClassMovePollService],
  providers: [LiveClassMovePollService]
})
export class MovePollModule {}
