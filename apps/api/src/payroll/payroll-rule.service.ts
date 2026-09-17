import { NotFoundException, Injectable } from "@nestjs/common";
import type {
  CreatePayrollRuleRequest,
  PayrollRuleItem,
  PayrollRuleListResponse,
  UpdatePayrollRuleRequest
} from "@nexa-chess/types";
import type { PayrollRule, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollAuditService } from "./payroll-audit.service";

/**
 * Admin CRUD for cancellation/attendance/bonus/deduction rules (§7/§26).
 * Effective-dated like a compensation rate, so editing a rule never rewrites
 * a past payroll period's already-frozen `ruleSnapshot`.
 */
@Injectable()
export class PayrollRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PayrollAuditService
  ) {}

  async list(): Promise<PayrollRuleListResponse> {
    const rules = await this.prisma.payrollRule.findMany({ orderBy: { priority: "desc" } });
    return { rules: rules.map((r) => this.toItem(r)) };
  }

  async get(id: string): Promise<PayrollRuleItem> {
    return this.toItem(await this.getOrThrow(id));
  }

  async create(actorId: string, dto: CreatePayrollRuleRequest): Promise<PayrollRuleItem> {
    const rule = await this.prisma.payrollRule.create({
      data: {
        name: dto.name,
        description: dto.description,
        ruleType: dto.ruleType,
        condition: dto.condition as unknown as Prisma.InputJsonValue,
        effect: dto.effect as unknown as Prisma.InputJsonValue,
        priority: dto.priority,
        enabled: dto.enabled,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        createdById: actorId
      }
    });

    await this.audit.log({
      entity: "PayrollRule",
      entityId: rule.id,
      action: "PAYROLL_RULE_CREATED",
      userId: actorId,
      metadata: { name: dto.name, ruleType: dto.ruleType }
    });

    return this.toItem(rule);
  }

  async update(id: string, actorId: string, dto: UpdatePayrollRuleRequest): Promise<PayrollRuleItem> {
    await this.getOrThrow(id);

    const rule = await this.prisma.payrollRule.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ruleType: dto.ruleType,
        condition: dto.condition as unknown as Prisma.InputJsonValue | undefined,
        effect: dto.effect as unknown as Prisma.InputJsonValue | undefined,
        priority: dto.priority,
        enabled: dto.enabled,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo === undefined ? undefined : dto.effectiveTo ? new Date(dto.effectiveTo) : null
      }
    });

    await this.audit.log({
      entity: "PayrollRule",
      entityId: id,
      action: "PAYROLL_RULE_UPDATED",
      userId: actorId,
      metadata: { changedFields: Object.keys(dto) }
    });

    return this.toItem(rule);
  }

  private async getOrThrow(id: string): Promise<PayrollRule> {
    const rule = await this.prisma.payrollRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Payroll rule not found.");
    return rule;
  }

  private toItem(rule: PayrollRule): PayrollRuleItem {
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      ruleType: rule.ruleType,
      condition: rule.condition as PayrollRuleItem["condition"],
      effect: rule.effect as PayrollRuleItem["effect"],
      priority: rule.priority,
      enabled: rule.enabled,
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      createdById: rule.createdById,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString()
    };
  }
}
