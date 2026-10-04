import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TrashModule } from '../trash/trash.module';
import { JwtModule } from '@nestjs/jwt';
import { MessagingModule } from '../messaging/messaging.module';
import { DemoClassModule } from '../demo-class/demo-class.module';

@Module({
  imports: [DemoClassModule, PrismaModule, JwtModule, MessagingModule, TrashModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
