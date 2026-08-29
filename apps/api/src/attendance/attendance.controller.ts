import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Req,
  Body,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { AttendanceService } from "./attendance.service";
import { UpdateAttendancePolicyDto } from "./dto/attendance-policy.dto";
import { API_ROUTES } from "@nexa-chess/types";

@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── Student Attendance ──

  @Get(API_ROUTES.attendance.student)
  getStudentAttendance(@Req() request: Request) {
    return this.attendanceService.getStudentAttendance(
      this.getAccessToken(request)
    );
  }

  @Get(API_ROUTES.attendance.studentById())
  getStudentAttendanceById(
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.attendanceService.getStudentAttendance(
      this.getAccessToken(request),
      id
    );
  }

  // ── Coach Teaching Stats ──

  @Get(API_ROUTES.attendance.coach)
  getCoachTeachingStats(@Req() request: Request) {
    return this.attendanceService.getCoachTeachingStats(
      this.getAccessToken(request)
    );
  }

  @Get(API_ROUTES.attendance.coachById())
  getCoachTeachingStatsById(
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.attendanceService.getCoachTeachingStats(
      this.getAccessToken(request),
      id
    );
  }

  // ── Class Attendance Report ──

  @Get(API_ROUTES.attendance.class())
  getClassAttendanceReport(
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.attendanceService.getClassAttendanceReport(
      this.getAccessToken(request),
      id
    );
  }

  // ── Detailed Logs ──

  @Get(API_ROUTES.attendance.classLogs())
  getAttendanceLogs(
    @Param("id") classId: string,
    @Param("studentId") studentId: string,
    @Req() request: Request
  ) {
    return this.attendanceService.getAttendanceLogs(
      this.getAccessToken(request),
      classId,
      studentId
    );
  }

  // ── Live Class Monitoring ──

  @Get(API_ROUTES.attendance.classLive())
  getLiveClassMonitoring(
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.attendanceService.getLiveClassMonitoring(
      this.getAccessToken(request),
      id
    );
  }

  // ── Admin Dashboard ──

  @Get(API_ROUTES.attendance.adminDashboard)
  getAdminDashboard(@Req() request: Request) {
    return this.attendanceService.getAdminDashboard(
      this.getAccessToken(request)
    );
  }

  // ── Admin Completed Classes ──

  @Get(API_ROUTES.attendance.adminCompletedClasses)
  getCompletedClasses(
    @Req() request: Request,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("coachId") coachId?: string,
    @Query("batchId") batchId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.attendanceService.getCompletedClasses(
      this.getAccessToken(request),
      {
        dateFrom,
        dateTo,
        coachId,
        batchId,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      }
    );
  }

  // ── Admin Coach Teaching Report ──

  @Get(API_ROUTES.attendance.adminCoachReport)
  getAdminCoachTeachingReport(
    @Req() request: Request,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("coachId") coachId?: string,
  ) {
    return this.attendanceService.getAdminCoachTeachingReport(
      this.getAccessToken(request),
      { dateFrom, dateTo, coachId }
    );
  }

  // ── Class Detail Report ──

  @Get(API_ROUTES.attendance.classDetail())
  getClassDetailReport(
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.attendanceService.getClassDetailReport(
      this.getAccessToken(request),
      id
    );
  }

  // ── Admin Export ──

  @Get(API_ROUTES.attendance.adminExport)
  async exportReport(
    @Req() request: Request,
    @Res() res: Response,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("batchId") batchId?: string,
    @Query("coachId") coachId?: string,
    @Query("status") status?: string,
  ) {
    const result = await this.attendanceService.exportAttendanceReport(
      this.getAccessToken(request),
      { dateFrom, dateTo, batchId, coachId, status }
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=attendance_report.csv"
    );
    res.send(result.csv);
  }

  // ── Policy ──

  @Get(API_ROUTES.attendance.policy)
  getPolicy(@Req() request: Request) {
    return this.attendanceService.getPolicy(this.getAccessToken(request));
  }

  @Put(API_ROUTES.attendance.policy)
  updatePolicy(
    @Req() request: Request,
    @Body() body: UpdateAttendancePolicyDto
  ) {
    return this.attendanceService.updatePolicy(
      this.getAccessToken(request),
      body
    );
  }
}
