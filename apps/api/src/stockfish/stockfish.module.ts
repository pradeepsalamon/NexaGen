import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameAnalysisEngineService } from './game-analysis-engine.service';
import { StockfishService } from './stockfish.service';
import { StockfishController } from './stockfish.controller';

@Module({
  imports: [JwtModule],
  controllers: [StockfishController],
  providers: [StockfishService, GameAnalysisEngineService],
  exports: [StockfishService, GameAnalysisEngineService]
})
export class StockfishModule {}
