import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { softDeleteExtension } from "./soft-delete.extension";

const createPrismaClient = () => new PrismaClient().$extends(softDeleteExtension);

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client = createPrismaClient();
  readonly withDeleted = this.client.$extends({
    name: "with-deleted",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const queryArgs = { ...(args as object) } as Record<string, unknown>;
          delete queryArgs.includeDeleted;

          return (query as (queryArgs: unknown) => unknown)(queryArgs);
        }
      }
    }
  });

  get user() {
    return this.client.user;
  }

  get studentProfile() {
    return this.client.studentProfile;
  }

  get coachProfile() {
    return this.client.coachProfile;
  }

  get authSession() {
    return this.client.authSession;
  }

  get passwordResetToken() {
    return this.client.passwordResetToken;
  }

  get emailVerificationToken() {
    return this.client.emailVerificationToken;
  }

  get batch() {
    return this.client.batch;
  }

  get batchCoach() {
    return this.client.batchCoach;
  }

  get batchStudent() {
    return this.client.batchStudent;
  }

  get trashAuditLog() {
    return this.client.trashAuditLog;
  }

  get coachClass() {
    return this.client.coachClass;
  }

  get liveSession() {
    return this.client.liveSession;
  }

  get course() {
    return this.client.course;
  }

  get courseModule() {
    return this.client.courseModule;
  }

  get studentCourseProgress() {
    return this.client.studentCourseProgress;
  }

  get practice() {
    return this.client.practice;
  }

  get studentPractice() {
    return this.client.studentPractice;
  }

  get studentActivity() {
    return this.client.studentActivity;
  }

  get announcement() {
    return this.client.announcement;
  }

  async $connect() {
    return this.client.$connect();
  }

  async $disconnect() {
    return this.client.$disconnect();
  }

  $transaction: typeof this.client.$transaction = this.client.$transaction.bind(
    this.client
  );

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
