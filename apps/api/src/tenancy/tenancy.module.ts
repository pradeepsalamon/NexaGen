import { Global, Module } from "@nestjs/common";
import { TenantResolverService } from "./tenant-resolver.service";

/** Academy resolution and context (docs/SAAS_MULTI_TENANCY.md §B, §E). */
@Global()
@Module({
  exports: [TenantResolverService],
  providers: [TenantResolverService]
})
export class TenancyModule {}
