import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { ChessAppearanceController } from "./chess-appearance.controller";
import { ChessAppearanceService } from "./chess-appearance.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [ChessAppearanceController],
  providers: [ChessAppearanceService],
  exports: [ChessAppearanceService],
})
export class ChessAppearanceModule {}
