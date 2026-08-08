import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StockfishService } from './stockfish.service';
import { StockfishController } from './stockfish.controller';

@Module({
  imports: [JwtModule],
  controllers: [StockfishController],
  providers: [StockfishService],
  exports: [StockfishService]
})
export class StockfishModule {}
