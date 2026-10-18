import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { RevisionController } from "./revision.controller";
import { RevisionService } from "./revision.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [RevisionController],
  providers: [RevisionService]
})
export class RevisionModule {}
