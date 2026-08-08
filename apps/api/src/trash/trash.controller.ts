import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { TrashBulkActionDto } from "./dto/trash-bulk-action.dto";
import { TrashQueryDto } from "./dto/trash-query.dto";
import { TrashService } from "./trash.service";

@Controller()
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get(API_ROUTES.trash.list)
  list(@Query() query: TrashQueryDto, @Req() request: Request) {
    return this.trashService.list(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.trash.restoreBulk)
  @HttpCode(HttpStatus.OK)
  bulkRestore(@Body() body: TrashBulkActionDto, @Req() request: Request) {
    return this.trashService.bulkRestore(this.getAccessToken(request), body);
  }

  @Delete(API_ROUTES.trash.list)
  @HttpCode(HttpStatus.OK)
  bulkPermanentDelete(
    @Body() body: TrashBulkActionDto,
    @Req() request: Request
  ) {
    return this.trashService.bulkPermanentDelete(
      this.getAccessToken(request),
      body
    );
  }

  @Delete(API_ROUTES.trash.empty)
  @HttpCode(HttpStatus.OK)
  emptyTrash(@Req() request: Request) {
    return this.trashService.emptyTrash(this.getAccessToken(request));
  }

  @Post(API_ROUTES.trash.restoreItem())
  @HttpCode(HttpStatus.OK)
  restore(
    @Param("entity") entity: string,
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.trashService.restore(this.getAccessToken(request), entity, id);
  }

  @Delete(API_ROUTES.trash.deleteItem())
  @HttpCode(HttpStatus.OK)
  permanentDelete(
    @Param("entity") entity: string,
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.trashService.permanentDelete(
      this.getAccessToken(request),
      entity,
      id
    );
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
