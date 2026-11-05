import { Global, Module } from "@nestjs/common";
import { DomainCheckService } from "./domain-check.service";
import { TenantResolverService } from "./tenant-resolver.service";

/** Academy resolution and context (docs/SAAS_MULTI_TENANCY.md §B, §E). */
@Global()
@Module({
  exports: [DomainCheckService, TenantResolverService],
  providers: [DomainCheckService, TenantResolverService]
})
export class TenancyModule {}
