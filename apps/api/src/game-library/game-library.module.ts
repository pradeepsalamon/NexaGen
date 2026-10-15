import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { GameLibraryController } from "./game-library.controller";
import { GameLibraryService } from "./game-library.service";
import { GameRecorderService } from "./game-recorder.service";

@Module({
  controllers: [GameLibraryController],
  exports: [GameRecorderService],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [GameLibraryService, GameRecorderService],
})
export class GameLibraryModule {}
