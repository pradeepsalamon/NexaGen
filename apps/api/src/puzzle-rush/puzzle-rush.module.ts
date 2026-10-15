import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassPuzzleRushController } from "./live-class-puzzle-rush.controller";
import { LiveClassPuzzleRushService } from "./live-class-puzzle-rush.service";

@Module({
  controllers: [LiveClassPuzzleRushController],
  imports: [LiveClassModule, PrismaModule],
  providers: [LiveClassPuzzleRushService]
})
export class PuzzleRushModule {}
