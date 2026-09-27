import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { LiveClassSimulController } from "./live-class-simul.controller";
import { LiveClassSimulService } from "./live-class-simul.service";

@Module({
  controllers: [LiveClassSimulController],
  imports: [LiveClassModule, PrismaModule, StockfishModule],
  providers: [LiveClassSimulService]
})
export class SimulModule {}
