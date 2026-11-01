import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import {
  API_ROUTES,
  bulkLibraryActivityRequestSchema,
  createLibraryActivityRequestSchema,
  libraryListQuerySchema,
  updateLibraryActivityRequestSchema,
  type BulkLibraryActivityRequest,
  type CreateLibraryActivityRequest,
  type UpdateLibraryActivityRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { RequireAccessTokenInterceptor } from "../common/security/require-access-token.interceptor";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { LibraryActivityService } from "./library-activity.service";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller()
export class LibraryActivityController {
  constructor(private readonly service: LibraryActivityService) {}

  @Get(API_ROUTES.puzzles.library)
  library(@Query() query: unknown, @Req() request: Request) {
    return this.service.library(this.getAccessToken(request), parseOrBadRequest(libraryListQuerySchema, query, "query"));
  }

  @Post(API_ROUTES.puzzles.activities)
  create(
    @Body(new ZodBodyPipe(createLibraryActivityRequestSchema)) body: CreateLibraryActivityRequest,
    @Req() request: Request
  ) {
    return this.service.create(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.puzzles.activityImage)
  // Auth before multer, and multer capped, so the body never sits in memory
  // unbounded or for an anonymous caller.
  @UseInterceptors(
    RequireAccessTokenInterceptor,
    FileInterceptor("file", { limits: { fields: 5, fileSize: MAX_IMAGE_BYTES, files: 1 } })
  )
  uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
          new FileTypeValidator({ fileType: ".(png|jpeg|jpg|webp)" })
        ]
      })
    )
    file: Express.Multer.File,
    @Req() request: Request
  ) {
    return this.service.uploadImage(this.getAccessToken(request), file);
  }

  @Post(API_ROUTES.puzzles.activityBulk)
  bulk(@Body(new ZodBodyPipe(bulkLibraryActivityRequestSchema)) body: BulkLibraryActivityRequest, @Req() request: Request) {
    return this.service.bulk(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.puzzles.activity())
  get(@Param("id") id: string, @Req() request: Request) {
    return this.service.get(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.puzzles.activity())
  update(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateLibraryActivityRequestSchema)) body: UpdateLibraryActivityRequest,
    @Req() request: Request
  ) {
    return this.service.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.puzzles.activity())
  remove(@Param("id") id: string, @Req() request: Request) {
    return this.service.remove(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.puzzles.activityPublish())
  publish(@Param("id") id: string, @Req() request: Request) {
    return this.service.setPublished(this.getAccessToken(request), id, true);
  }

  @Delete(API_ROUTES.puzzles.activityPublish())
  unpublish(@Param("id") id: string, @Req() request: Request) {
    return this.service.setPublished(this.getAccessToken(request), id, false);
  }

  @Post(API_ROUTES.puzzles.activityArchive())
  archive(@Param("id") id: string, @Req() request: Request) {
    return this.service.setArchived(this.getAccessToken(request), id, true);
  }

  @Delete(API_ROUTES.puzzles.activityArchive())
  unarchive(@Param("id") id: string, @Req() request: Request) {
    return this.service.setArchived(this.getAccessToken(request), id, false);
  }

  @Post(API_ROUTES.puzzles.activityDuplicate())
  duplicate(@Param("id") id: string, @Req() request: Request) {
    return this.service.duplicate(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
