import { Module } from "@nestjs/common";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LiveClassMatchController } from "./live-class-match.controller";
import { LiveClassMatchService } from "./live-class-match.service";

@Module({
  controllers: [LiveClassMatchController],
  imports: [LiveClassModule, PrismaModule],
  providers: [LiveClassMatchService]
})
export class StudentMatchModule {}
