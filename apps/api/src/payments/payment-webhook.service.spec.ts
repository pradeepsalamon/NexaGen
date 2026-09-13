import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma, WebhookEventStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentService } from "./payment.service";
import type { WebhookResult } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";
import { RefundService } from "./refund.service";
import { SubscriptionService } from "./subscription.service";

/**
 * Webhook intake (§10).
 *
 * The three properties under test are the ones that keep the endpoint safe when
 * it is, by design, publicly reachable: an unsigned payload is never acted on,
 * a redelivery runs the handler exactly once, and an event for something we do
 * not recognise is recorded rather than guessed at.
 */

const webhookResult = (overrides: Partial<WebhookResult> = {}): WebhookResult => ({
  eventId: "evt_1",
  eventType: "payment.captured",
  signatureValid: true,
  subject: "PAYMENT",
  providerPaymentId: "pay_1",
  providerOrderId: "order_1",
  providerRefundId: null,
  providerSubscriptionId: null,
  paymentId: "pmt_1",
  paymentStatus: "PAID",
  refundStatus: null,
  subscriptionStatus: null,
  method: "UPI",
  methodDetail: "upi · gpay",
  amount: 99900,
  amountRefunded: null,
  currency: "INR",
  failureCode: null,
  failureMessage: null,
  paidAt: new Date("2026-09-14T10:00:00Z"),
  nextBillingDate: null,
  raw: { event: "payment.captured" },
  ...overrides
});

describe("PaymentWebhookService", () => {
  let service: PaymentWebhookService;
  let handleWebhook: jest.Mock;
  let applyProviderState: jest.Mock;
  let createEvent: jest.Mock;
  let updateEvent: jest.Mock;
  let findPayment: jest.Mock;

  const duplicateError = new Prisma.PrismaClientKnownRequestError("dup", {
    code: "P2002",
    clientVersion: "6.19.3"
  });

  beforeEach(async () => {
    handleWebhook = jest.fn().mockResolvedValue(webhookResult());
    applyProviderState = jest
      .fn()
      .mockResolvedValue({ changed: true, status: "PAID" });
    createEvent = jest.fn().mockResolvedValue({ id: "evt_row_1" });
    updateEvent = jest.fn().mockResolvedValue({});
    findPayment = jest.fn().mockResolvedValue({ id: "pmt_1" });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentWebhookService,
        {
          provide: PrismaService,
          useValue: {
            paymentWebhookEvent: {
              create: createEvent,
              update: updateEvent,
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([])
            },
            payment: {
              findUnique: findPayment,
              findFirst: jest.fn().mockResolvedValue(null)
            },
            refund: { findFirst: jest.fn().mockResolvedValue(null) }
          }
        },
        { provide: PaymentService, useValue: { applyProviderState } },
        { provide: RefundService, useValue: { applyProviderState: jest.fn() } },
        { provide: SubscriptionService, useValue: { applyWebhook: jest.fn() } },
        {
          provide: ProviderRegistry,
          useValue: { get: () => ({ handleWebhook, isConfigured: () => true }) }
        }
      ]
    }).compile();

    service = module.get(PaymentWebhookService);
  });

  const body = JSON.stringify({ event: "payment.captured" });

  it("processes a valid, signed event", async () => {
    const result = await service.handle("RAZORPAY", body, {});

    expect(result.status).toBe(WebhookEventStatus.PROCESSED);
    expect(applyProviderState).toHaveBeenCalledWith(
      "pmt_1",
      expect.objectContaining({ status: "PAID", amount: 99900 }),
      "webhook:payment.captured"
    );
  });

  it("rejects an unsigned payload and never acts on it", async () => {
    handleWebhook.mockResolvedValue(webhookResult({ signatureValid: false }));

    await expect(service.handle("RAZORPAY", body, {})).rejects.toBeInstanceOf(
      BadRequestException
    );

    // Recorded for the audit trail, but the handler never ran.
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WebhookEventStatus.IGNORED,
          signatureValid: false
        })
      })
    );
    expect(applyProviderState).not.toHaveBeenCalled();
  });

  it("runs the handler exactly once for a redelivered event", async () => {
    // The unique (provider, eventId) rejects the second insert, which is how a
    // retry is detected — no check-then-act race.
    createEvent.mockRejectedValueOnce(duplicateError);

    const result = await service.handle("RAZORPAY", body, {});

    expect(result.status).toBe(WebhookEventStatus.PROCESSED);
    expect(applyProviderState).not.toHaveBeenCalled();
  });

  it("still returns 200-shaped success when the handler throws", async () => {
    // A provider that retries forever because of a bug of ours is worse than a
    // FAILED row we can replay ourselves.
    applyProviderState.mockRejectedValue(new Error("database is down"));

    const result = await service.handle("RAZORPAY", body, {});

    expect(result).toEqual({ received: true, status: WebhookEventStatus.FAILED });
    expect(updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WebhookEventStatus.FAILED,
          error: "database is down"
        })
      })
    );
  });

  it("ignores an event for a payment we never created", async () => {
    findPayment.mockResolvedValue(null);

    const result = await service.handle("RAZORPAY", body, {});

    expect(result.status).toBe(WebhookEventStatus.IGNORED);
    expect(applyProviderState).not.toHaveBeenCalled();
  });

  it("ignores an event that carries no mapped status", async () => {
    handleWebhook.mockResolvedValue(
      webhookResult({ eventType: "payment.downtime.started", paymentStatus: null })
    );

    const result = await service.handle("RAZORPAY", body, {});
    expect(result.status).toBe(WebhookEventStatus.IGNORED);
  });

  it("refuses a body that is not raw text", async () => {
    // main.ts mounts express.text on these routes; an object here means a JSON
    // parser consumed the body and no signature could ever match.
    await expect(
      service.handle("RAZORPAY", {} as unknown as string, {})
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.handle("RAZORPAY", "", {})).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("routes a refund event to the refund service", async () => {
    handleWebhook.mockResolvedValue(
      webhookResult({
        eventType: "refund.processed",
        subject: "REFUND",
        paymentStatus: null,
        refundStatus: "SUCCEEDED",
        providerRefundId: "rfnd_1"
      })
    );

    const result = await service.handle("RAZORPAY", body, {});

    // No matching refund row in this fixture, so it is recorded and ignored —
    // never applied to a guess.
    expect(result.status).toBe(WebhookEventStatus.IGNORED);
    expect(applyProviderState).not.toHaveBeenCalled();
  });
});
