import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  bulkPuzzleActionRequestSchema,
  bulkUpdatePuzzlesRequestSchema,
  catalogAdoptRequestSchema,
  catalogListQuerySchema,
  catalogMaterialiseRequestSchema,
  importPuzzlesRequestSchema,
  createPuzzleRequestSchema,
  createPuzzleTopicRequestSchema,
  puzzleHintRequestSchema,
  puzzleListQuerySchema,
  puzzleTrainingNextRequestSchema,
  reassignPuzzleTopicRequestSchema,
  copyPuzzleTopicRequestSchema,
  savePuzzleAttemptRequestSchema,
  setPuzzleArchivedRequestSchema,
  setPuzzlePublishedRequestSchema,
  studentPuzzleListQuerySchema,
  submitPuzzleAttemptRequestSchema,
  updatePuzzleRequestSchema,
  updatePuzzleScoringSettingsRequestSchema,
  updatePuzzleTopicRequestSchema,
  validatePuzzleRequestSchema,
  type BulkPuzzleActionRequest,
  type BulkUpdatePuzzlesRequest,
  type CatalogAdoptRequest,
  type CatalogListQuery,
  type CatalogMaterialiseRequest,
  type ImportPuzzlesRequest,
  type CreatePuzzleRequest,
  type CreatePuzzleTopicRequest,
  type PuzzleHintRequest,
  type PuzzleListQuery,
  type PuzzleTrainingNextRequest,
  type ReassignPuzzleTopicRequest,
  type CopyPuzzleTopicRequest,
  type SavePuzzleAttemptRequest,
  type SetPuzzleArchivedRequest,
  type SetPuzzlePublishedRequest,
  type StudentPuzzleListQuery,
  type SubmitPuzzleAttemptRequest,
  type UpdatePuzzleRequest,
  type UpdatePuzzleScoringSettingsRequest,
  type UpdatePuzzleTopicRequest,
  type ValidatePuzzleRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
import { PuzzleCatalogService } from "./puzzle-catalog.service";
import { PuzzleScoringSettingsService } from "./puzzle-scoring-settings.service";
import { PuzzleTopicService } from "./puzzle-topic.service";
import { PuzzleTrainingService } from "./puzzle-training.service";
import { PuzzleService } from "./puzzle.service";

@Controller()
export class PuzzleController {
  constructor(
    private readonly puzzleService: PuzzleService,
    private readonly topicService: PuzzleTopicService,
    private readonly attemptService: PuzzleAttemptService,
    private readonly catalogService: PuzzleCatalogService,
    private readonly scoringSettings: PuzzleScoringSettingsService,
    private readonly trainingService: PuzzleTrainingService
  ) {}

  // ── Topics ──

  @Get(API_ROUTES.puzzles.topics)
  listTopics(@Req() request: Request) {
    return this.topicService.list(this.token(request));
  }

  @Post(API_ROUTES.puzzles.topics)
  createTopic(
    @Body(new ZodBodyPipe(createPuzzleTopicRequestSchema)) body: CreatePuzzleTopicRequest,
    @Req() request: Request
  ) {
    return this.topicService.create(this.token(request), body);
  }

  @Get(API_ROUTES.puzzles.topic())
  getTopic(@Param("id") id: string, @Req() request: Request) {
    return this.topicService.get(this.token(request), id);
  }

  @Patch(API_ROUTES.puzzles.topic())
  updateTopic(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updatePuzzleTopicRequestSchema)) body: UpdatePuzzleTopicRequest,
    @Req() request: Request
  ) {
    return this.topicService.update(this.token(request), id, body);
  }

  @Post(API_ROUTES.puzzles.archiveTopic())
  archiveTopic(@Param("id") id: string, @Req() request: Request) {
    return this.topicService.archive(this.token(request), id);
  }

  @Post(API_ROUTES.puzzles.reassignTopic())
  reassignTopic(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reassignPuzzleTopicRequestSchema)) body: ReassignPuzzleTopicRequest,
    @Req() request: Request
  ) {
    return this.topicService.reassign(this.token(request), id, body);
  }

  @Post(API_ROUTES.puzzles.copyTopic())
  copyTopic(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(copyPuzzleTopicRequestSchema)) body: CopyPuzzleTopicRequest,
    @Req() request: Request
  ) {
    return this.topicService.copy(this.token(request), id, body);
  }

  @Get(API_ROUTES.puzzles.topicHomework())
  getTopicHomework(@Param("id") id: string, @Req() request: Request) {
    return this.topicService.homework(this.token(request), id);
  }

  @Put(API_ROUTES.puzzles.topicHomework())
  approveTopicHomework(@Param("id") id: string, @Req() request: Request) {
    return this.topicService.approveHomework(this.token(request), id);
  }

  @Delete(API_ROUTES.puzzles.topicHomework())
  revokeTopicHomework(@Param("id") id: string, @Req() request: Request) {
    return this.topicService.revokeHomework(this.token(request), id);
  }

  // ── Live-class points & leaderboard defaults ──
  // Declared before the `/puzzles/:id` routes so "scoring-settings" is never
  // captured as a puzzle id.

  @Get(API_ROUTES.puzzles.scoringSettings)
  getScoringSettings(@Req() request: Request) {
    return this.scoringSettings.get(this.token(request));
  }

  @Put(API_ROUTES.puzzles.scoringSettings)
  updateScoringSettings(
    @Body(new ZodBodyPipe(updatePuzzleScoringSettingsRequestSchema))
    body: UpdatePuzzleScoringSettingsRequest,
    @Req() request: Request
  ) {
    return this.scoringSettings.update(this.token(request), body);
  }

  // ── Student rated training ──
  // Before `/puzzles/:id`, so "training" is never captured as a puzzle id.

  @Get(API_ROUTES.puzzles.training)
  trainingStatus(@Req() request: Request) {
    return this.trainingService.status(this.token(request));
  }

  @Post(API_ROUTES.puzzles.trainingNext)
  trainingNext(
    @Body(new ZodBodyPipe(puzzleTrainingNextRequestSchema)) body: PuzzleTrainingNextRequest,
    @Req() request: Request
  ) {
    return this.trainingService.next(this.token(request), body);
  }

  // ── Lichess catalogue ──
  // Also before `/puzzles/:id`, so "catalog" is never captured as a puzzle id.

  @Get(API_ROUTES.puzzles.catalog)
  catalog(
    @Query(new ZodBodyPipe(catalogListQuerySchema)) query: CatalogListQuery,
    @Req() request: Request
  ) {
    return this.catalogService.list(this.token(request), query);
  }

  @Get(API_ROUTES.puzzles.catalogPreview())
  catalogPreview(@Param("sourceId") sourceId: string, @Req() request: Request) {
    return this.catalogService.preview(this.token(request), sourceId);
  }

  @Post(API_ROUTES.puzzles.catalogMaterialise)
  catalogMaterialise(
    @Body(new ZodBodyPipe(catalogMaterialiseRequestSchema)) body: CatalogMaterialiseRequest,
    @Req() request: Request
  ) {
    return this.catalogService.materialiseOne(this.token(request), body);
  }

  @Post(API_ROUTES.puzzles.catalogAdopt)
  catalogAdopt(
    @Body(new ZodBodyPipe(catalogAdoptRequestSchema)) body: CatalogAdoptRequest,
    @Req() request: Request
  ) {
    return this.catalogService.adopt(this.token(request), body);
  }

  // ── Library ──

  @Get(API_ROUTES.puzzles.stats)
  stats(@Req() request: Request) {
    return this.puzzleService.stats(this.token(request));
  }

  @Post(API_ROUTES.puzzles.validate)
  validate(
    @Body(new ZodBodyPipe(validatePuzzleRequestSchema)) body: ValidatePuzzleRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.validate(this.token(request), body);
  }

  @Post(API_ROUTES.puzzles.bulk)
  bulk(
    @Body(new ZodBodyPipe(bulkPuzzleActionRequestSchema)) body: BulkPuzzleActionRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.bulk(this.token(request), body);
  }

  @Post(API_ROUTES.puzzles.bulkUpdate)
  bulkUpdate(
    @Body(new ZodBodyPipe(bulkUpdatePuzzlesRequestSchema)) body: BulkUpdatePuzzlesRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.bulkUpdate(this.token(request), body);
  }

  @Post(API_ROUTES.puzzles.import)
  importMany(
    @Body(new ZodBodyPipe(importPuzzlesRequestSchema)) body: ImportPuzzlesRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.importMany(this.token(request), body);
  }

  @Get(API_ROUTES.puzzles.list)
  list(@Query(new ZodBodyPipe(puzzleListQuerySchema)) query: PuzzleListQuery, @Req() request: Request) {
    return this.puzzleService.list(this.token(request), query);
  }

  @Post(API_ROUTES.puzzles.create)
  create(
    @Body(new ZodBodyPipe(createPuzzleRequestSchema)) body: CreatePuzzleRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.create(this.token(request), body);
  }

  // ── Student practice ──

  @Get(API_ROUTES.puzzles.mine)
  listMine(@Query(new ZodBodyPipe(studentPuzzleListQuerySchema)) query: StudentPuzzleListQuery, @Req() request: Request) {
    return this.attemptService.listForStudent(this.token(request), query);
  }

  @Get(API_ROUTES.puzzles.mineGet())
  getMine(@Param("id") id: string, @Req() request: Request) {
    return this.attemptService.getForStudent(this.token(request), id);
  }

  @Post(API_ROUTES.puzzles.attempts())
  startAttempt(@Param("id") id: string, @Req() request: Request) {
    return this.attemptService.start(this.token(request), id);
  }

  @Get(API_ROUTES.puzzles.attempts())
  attemptHistory(@Param("id") id: string, @Req() request: Request) {
    return this.attemptService.history(this.token(request), id);
  }

  @Get(API_ROUTES.puzzles.attempt())
  getAttempt(
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Req() request: Request
  ) {
    return this.attemptService.get(this.token(request), id, attemptId);
  }

  @Patch(API_ROUTES.puzzles.attempt())
  saveAttempt(
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Body(new ZodBodyPipe(savePuzzleAttemptRequestSchema)) body: SavePuzzleAttemptRequest,
    @Req() request: Request
  ) {
    return this.attemptService.saveProgress(this.token(request), id, attemptId, body);
  }

  @Post(API_ROUTES.puzzles.submitAttempt())
  submitAttempt(
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Body(new ZodBodyPipe(submitPuzzleAttemptRequestSchema)) body: SubmitPuzzleAttemptRequest,
    @Req() request: Request
  ) {
    return this.attemptService.submit(this.token(request), id, attemptId, body);
  }

  @Post(API_ROUTES.puzzles.hint())
  hint(
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Body(new ZodBodyPipe(puzzleHintRequestSchema)) body: PuzzleHintRequest,
    @Req() request: Request
  ) {
    return this.attemptService.hint(this.token(request), id, attemptId, body);
  }

  // ── Library item lifecycle ──

  @Post(API_ROUTES.puzzles.publish())
  publish(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(setPuzzlePublishedRequestSchema)) body: SetPuzzlePublishedRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.setPublished(this.token(request), id, body);
  }

  @Post(API_ROUTES.puzzles.archive())
  archive(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(setPuzzleArchivedRequestSchema)) body: SetPuzzleArchivedRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.setArchived(this.token(request), id, body);
  }

  @Post(API_ROUTES.puzzles.duplicate())
  duplicate(@Param("id") id: string, @Req() request: Request) {
    return this.puzzleService.duplicate(this.token(request), id);
  }

  @Get(API_ROUTES.puzzles.get())
  get(@Param("id") id: string, @Req() request: Request) {
    return this.puzzleService.get(this.token(request), id);
  }

  @Patch(API_ROUTES.puzzles.update())
  update(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updatePuzzleRequestSchema)) body: UpdatePuzzleRequest,
    @Req() request: Request
  ) {
    return this.puzzleService.update(this.token(request), id, body);
  }

  @Delete(API_ROUTES.puzzles.delete())
  remove(@Param("id") id: string, @Req() request: Request) {
    return this.puzzleService.remove(this.token(request), id);
  }

  private token(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
