import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ClassroomToolsController } from "./classroom-tools.controller";
import { ClassroomToolsService } from "./classroom-tools.service";

@Module({
  controllers: [ClassroomToolsController],
  imports: [LiveClassModule, PrismaModule],
  providers: [ClassroomToolsService]
})
export class ClassroomToolsModule {}
