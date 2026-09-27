import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { TypographyController } from "./typography.controller";
import { TypographyService } from "./typography.service";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [TypographyController],
  providers: [TypographyService],
})
export class TypographyModule {}
