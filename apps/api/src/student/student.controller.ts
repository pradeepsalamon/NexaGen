import {
  Controller,
  Get,
  Param,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { StudentService } from "./student.service";

@Controller()
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get(API_ROUTES.student.dashboard)
  getDashboard(@Req() request: Request) {
    return this.studentService.getDashboard(this.getAccessToken(request));
  }

  @Get(API_ROUTES.student.classDetail())
  getClassDetail(@Param("id") id: string, @Req() request: Request) {
    return this.studentService.getClassDetail(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
