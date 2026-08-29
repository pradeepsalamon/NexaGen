import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AttendanceModule } from "../attendance/attendance.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StudentController } from "./student.controller";
import { StudentService } from "./student.service";

@Module({
  controllers: [StudentController],
  imports: [AttendanceModule, JwtModule, PrismaModule],
  providers: [StudentService]
})
export class StudentModule { }
