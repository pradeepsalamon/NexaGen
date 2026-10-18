import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameAnalysisModule } from '../game-analysis/game-analysis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GameImportService } from './game-import.service';
import { GameSourcesController } from './game-sources.controller';
import { GameSourcesService } from './game-sources.service';

@Module({
  controllers: [GameSourcesController],
  imports: [GameAnalysisModule, JwtModule, PrismaModule],
  providers: [GameImportService, GameSourcesService],
})
export class GameSourcesModule {}
