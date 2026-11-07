import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { KnowledgeAdminController } from "./knowledge-admin.controller";
import { KnowledgeAdminService } from "./knowledge-admin.service";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";
import { KnowledgeToolsProvider } from "./knowledge.tools";
import { TrashModule } from "../trash/trash.module";

// Knowledge base / help centre (docs/KNOWLEDGE_BASE.md).
@Module({
  controllers: [KnowledgeController, KnowledgeAdminController],
  exports: [KnowledgeService, KnowledgeToolsProvider],
  imports: [JwtModule.register({}), PrismaModule, TrashModule],
  providers: [KnowledgeAdminService, KnowledgeService, KnowledgeToolsProvider],
})
export class KnowledgeModule {}
