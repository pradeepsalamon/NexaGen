import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { CourseProgressService } from "./course-progress.service";
import { CourseController } from "./course.controller";
import { CourseService } from "./course.service";

@Module({
  controllers: [CourseController],
  imports: [JwtModule.register({}), PrismaModule, TrashModule],
  providers: [CourseService, CourseProgressService]
})
export class CourseModule {}
