import { GameLibraryModule } from "../game-library/game-library.module";
import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassMatchController } from "./live-class-match.controller";
import { LiveClassMatchService } from "./live-class-match.service";

@Module({
  controllers: [LiveClassMatchController],
  imports: [GameLibraryModule, LiveClassModule, PrismaModule],
  providers: [LiveClassMatchService]
})
export class StudentMatchModule {}
