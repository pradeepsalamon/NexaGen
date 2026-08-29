import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { UploadModule } from "../upload/upload.module";
import { AssignmentController } from "./assignment.controller";
import { AssignmentService } from "./assignment.service";

@Module({
  controllers: [AssignmentController],
  imports: [JwtModule, PrismaModule, UploadModule],
  providers: [AssignmentService]
})
export class AssignmentModule {}
