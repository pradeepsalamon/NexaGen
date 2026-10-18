import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateOfflinePaymentMethodRequest,
  OfflinePaymentMethodItem,
  UpdateOfflinePaymentMethodRequest
} from "@nexa-chess/types";
import type { OfflinePaymentMethod } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueViolation } from "./payments.util";

const DEFAULT_METHODS: { key: string; label: string; sortOrder: number }[] = [
  { key: "cash", label: "Cash", sortOrder: 0 },
  { key: "upi_gpay", label: "UPI / GPay (personal)", sortOrder: 1 },
  { key: "bank_transfer", label: "Bank transfer", sortOrder: 2 },
  { key: "other", label: "Other", sortOrder: 3 }
];

/**
 * The admin-configurable catalogue of offline ways a student can pay. Never
 * hard-deleted once a `ManualPaymentRecord` references it (§7 rule 9-adjacent:
 * a financial dimension archives, it does not disappear) — `deactivate`
 * instead.
 */
@Injectable()
export class OfflinePaymentMethodService {
  constructor(private readonly prisma: PrismaService) {}

  /** Seeds the 4 defaults on first read — same precedent as MessagingRuleService. */
  async list(activeOnly = false): Promise<OfflinePaymentMethodItem[]> {
    const count = await this.prisma.offlinePaymentMethod.count();
    if (count === 0) {
      await this.prisma.offlinePaymentMethod.createMany({ data: DEFAULT_METHODS });
    }

    const rows = await this.prisma.offlinePaymentMethod.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
    });
    return rows.map(toItem);
  }

  async create(
    dto: CreateOfflinePaymentMethodRequest
  ): Promise<OfflinePaymentMethodItem> {
    const key = slugify(dto.label);
    try {
      const row = await this.prisma.offlinePaymentMethod.create({
        data: { key, label: dto.label, sortOrder: dto.sortOrder }
      });
      return toItem(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A method with that name already exists.");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateOfflinePaymentMethodRequest
  ): Promise<OfflinePaymentMethodItem> {
    const existing = await this.prisma.offlinePaymentMethod.findUnique({
      where: { id }
    });
    if (!existing) throw new NotFoundException("Offline payment method not found.");

    try {
      const row = await this.prisma.offlinePaymentMethod.update({
        where: { id },
        data: {
          ...(dto.label !== undefined
            ? { label: dto.label, key: slugify(dto.label) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {})
        }
      });
      return toItem(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A method with that name already exists.");
      }
      throw error;
    }
  }

  async requireActive(id: string): Promise<OfflinePaymentMethod> {
    const method = await this.prisma.offlinePaymentMethod.findUnique({
      where: { id }
    });
    if (!method || !method.isActive) {
      throw new NotFoundException("That payment method is not available.");
    }
    return method;
  }
}

function toItem(row: OfflinePaymentMethod): OfflinePaymentMethodItem {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    isActive: row.isActive,
    sortOrder: row.sortOrder
  };
}

function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `method_${Date.now()}`;
}
