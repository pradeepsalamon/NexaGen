import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AttendanceModule } from "../attendance/attendance.module";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StudentController } from "./student.controller";
import { StudentService } from "./student.service";

@Module({
  controllers: [StudentController],
  imports: [AttendanceModule, JwtModule, LiveClassModule, PrismaModule],
  providers: [StudentService]
})
export class StudentModule { }
