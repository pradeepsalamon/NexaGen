import { Global, Module } from "@nestjs/common";
import { AcademyLinksService } from "./academy-links.service";
import { DomainCheckService } from "./domain-check.service";
import { TenantResolverService } from "./tenant-resolver.service";

/** Academy resolution and context (docs/SAAS_MULTI_TENANCY.md §B, §E). */
@Global()
@Module({
  exports: [AcademyLinksService, DomainCheckService, TenantResolverService],
  providers: [AcademyLinksService, DomainCheckService, TenantResolverService]
})
export class TenancyModule {}
