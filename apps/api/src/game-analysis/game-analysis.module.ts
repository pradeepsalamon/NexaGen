import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameLibraryModule } from '../game-library/game-library.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PuzzleModule } from '../puzzle/puzzle.module';
import { StockfishModule } from '../stockfish/stockfish.module';
import { GameAnalysisController } from './game-analysis.controller';
import { GameAnalysisService } from './game-analysis.service';
import { GameAnalysisWorker } from './game-analysis.worker';
import { GameInsightsService } from './game-insights.service';
import { GameRevisionService } from './game-revision.service';

@Module({
  controllers: [GameAnalysisController],
  exports: [GameAnalysisService],
  imports: [GameLibraryModule, JwtModule, PrismaModule, PuzzleModule, StockfishModule],
  providers: [GameAnalysisService, GameAnalysisWorker, GameInsightsService, GameRevisionService],
})
export class GameAnalysisModule {}
