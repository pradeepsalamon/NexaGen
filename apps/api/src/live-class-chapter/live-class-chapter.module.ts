import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassChapterController } from "./live-class-chapter.controller";
import { LiveClassChapterService } from "./live-class-chapter.service";

@Module({
  controllers: [LiveClassChapterController],
  imports: [LiveClassModule, PrismaModule],
  providers: [LiveClassChapterService]
})
export class LiveClassChapterModule {}
