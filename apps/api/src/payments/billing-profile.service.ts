import { Injectable } from "@nestjs/common";
import {
  billingAddressSchema,
  stateCodeFromGstin,
  type BillingAddress,
  type UpdateBillingProfileRequest
} from "@nexa-chess/types";
import { UserRole, type BillingProfile, type User } from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { fullName } from "./payments-auth.helper";

/**
 * The bill-payer's identity (§5).
 *
 * A student account is usually paid for by a parent, so an invoice must not
 * blindly carry the student's own name and email. Resolution order is:
 *
 *   1. the saved BillingProfile, if the buyer has entered one;
 *   2. for a student, the parent details on their StudentProfile;
 *   3. the account itself.
 */
@Injectable()
export class BillingProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<BillingAddress | null> {
    const row = await this.prisma.billingProfile.findUnique({
      where: { userId }
    });
    return row ? toAddress(row) : null;
  }

  async upsert(
    userId: string,
    input: UpdateBillingProfileRequest
  ): Promise<BillingAddress> {
    const current = (await this.get(userId)) ?? (await this.resolve(userId));

    const merged = billingAddressSchema.parse({
      ...current,
      ...stripUndefined(input)
    });

    // The state code is what decides CGST+SGST versus IGST, so it is always
    // derived from the GSTIN rather than typed — a buyer cannot pick their own
    // tax treatment by entering a mismatched state.
    const stateCode = stateCodeFromGstin(merged.gstin) ?? merged.stateCode ?? null;

    const data = {
      name: merged.name,
      email: merged.email ?? null,
      phone: merged.phone ?? null,
      line1: merged.line1 ?? null,
      line2: merged.line2 ?? null,
      city: merged.city ?? null,
      state: merged.state ?? null,
      stateCode,
      postalCode: merged.postalCode ?? null,
      country: merged.country,
      gstin: emptyToNull(merged.gstin),
      businessName: merged.businessName ?? null
    };

    const row = await this.prisma.billingProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data
    });

    return toAddress(row);
  }

  /**
   * The address an invoice is stamped with. Always returns something usable —
   * an invoice must be issuable even for a buyer who never filled in a form.
   */
  async resolve(
    userId: string,
    tx?: PrismaTransactionClient
  ): Promise<BillingAddress> {
    const client = tx ?? this.prisma;

    const user = await client.user.findUnique({
      where: { id: userId },
      include: {
        billingProfile: true,
        studentProfile: {
          select: { parentName: true, parentEmail: true, parentPhone: true }
        }
      }
    });

    if (!user) {
      // Only reachable if the account was hard-deleted between capture and
      // issue. The invoice still has to exist, so it is issued unattributed.
      return billingAddressSchema.parse({ name: "Customer", country: "IN" });
    }

    if (user.billingProfile) return toAddress(user.billingProfile);

    const parent = user.studentProfile;
    if (user.role === UserRole.STUDENT && parent?.parentName) {
      return billingAddressSchema.parse({
        name: parent.parentName,
        // Falls back to the student's own address only for whichever contact
        // detail the parent record is missing.
        email: parent.parentEmail ?? user.email,
        phone: parent.parentPhone ?? user.phoneNumber,
        country: "IN"
      });
    }

    return billingAddressSchema.parse({
      name: fullName(user) ?? user.email,
      email: user.email,
      phone: user.phoneNumber,
      country: "IN"
    });
  }

  /** Used by the admin invoice view to show who a document was billed to. */
  async resolveForUser(user: User): Promise<BillingAddress> {
    return this.resolve(user.id);
  }
}

function toAddress(row: BillingProfile): BillingAddress {
  return billingAddressSchema.parse({
    name: row.name,
    email: row.email,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    stateCode: row.stateCode,
    postalCode: row.postalCode,
    country: row.country,
    gstin: row.gstin,
    businessName: row.businessName
  });
}

function emptyToNull(value: string | null | undefined): string | null {
  return value && value.trim() !== "" ? value : null;
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
