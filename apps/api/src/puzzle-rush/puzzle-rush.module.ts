import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassPuzzleRushController } from "./live-class-puzzle-rush.controller";
import { LiveClassPuzzleRushService } from "./live-class-puzzle-rush.service";
import { SoloPuzzleRushController } from "./solo-puzzle-rush.controller";
import { SoloPuzzleRushService } from "./solo-puzzle-rush.service";

@Module({
  controllers: [LiveClassPuzzleRushController, SoloPuzzleRushController],
  imports: [JwtModule, LiveClassModule, PrismaModule],
  providers: [LiveClassPuzzleRushService, SoloPuzzleRushService]
})
export class PuzzleRushModule {}
