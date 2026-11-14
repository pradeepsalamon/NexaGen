import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { GameLibraryController } from "./game-library.controller";
import { GameLibraryService } from "./game-library.service";
import { GameRecorderService } from "./game-recorder.service";
import { TrashModule } from "../trash/trash.module";

@Module({
  controllers: [GameLibraryController],
  exports: [GameLibraryService, GameRecorderService],
  imports: [JwtModule.register({}), PrismaModule, TrashModule],
  providers: [GameLibraryService, GameRecorderService],
})
export class GameLibraryModule {}
