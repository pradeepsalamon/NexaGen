"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApplyDiscountRequest,
  CancelSubscriptionRequest,
  CreateBatchPlanRequest,
  CreateDiscountRequest,
  CreateOfflinePaymentMethodRequest,
  ManualPaymentReviewStatus,
  RecordManualPaymentRequest,
  UpdateDiscountRequest,
  UpdateOfflinePaymentMethodRequest,
  CreateCheckoutRequest,
  CreatePlanRequest,
  CreateRefundRequest,
  PaymentListQuery,
  PaymentMethodKind,
  PaymentRoutingConfig,
  UpdatePlanRequest,
  VerifyPaymentRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  approveManualPayment,
  archiveBatchPlan,
  archivePlan,
  cancelSubscription,
  createBatchPlan,
  createDiscount,
  createOfflineMethod,
  deleteDiscount,
  getAdminManualPayments,
  getAdminOfflineMethods,
  getBatchPricing,
  getDiscounts,
  getManualBatchPlans,
  getManualBatchStudents,
  getMyManualPayments,
  getOfflineMethods,
  previewDiscount,
  recordManualPayment,
  rejectManualPayment,
  updateBatchPlan,
  updateDiscount,
  updateOfflineMethod,
  createCheckout,
  createPlan,
  getAdminInvoices,
  getAdminPayment,
  getAdminPayments,
  getAdminPlans,
  getAdminSubscriptions,
  getCheckoutConfig,
  getMyBilling,
  getPaymentOverview,
  getPaymentStatus,
  getPlans,
  getProviderHealth,
  getRefunds,
  getRouting,
  reconcilePayment,
  refundPayment,
  retryPayment,
  saveRouting,
  updatePlan,
  verifyPayment
} from "../api/paymentsApi";

// ── Student ──

export function usePlans() {
  return useQuery({ queryKey: queryKeys.payments.plans, queryFn: getPlans });
}

export function useCheckoutConfig(planId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.checkoutConfig(planId ?? ""),
    queryFn: () => getCheckoutConfig(planId as string),
    enabled: Boolean(planId)
  });
}

/**
 * Opening a checkout is not undoable — it reaches a payment gateway. The undo
 * policy (lib/undo/README.md) excludes anything with an outbound side effect.
 */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: (data: CreateCheckoutRequest) => createCheckout(data)
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      paymentId,
      data
    }: {
      paymentId: string;
      data: VerifyPaymentRequest;
    }) => verifyPayment(paymentId, data),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.payments.status(status.paymentId), status);
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.billing });
    }
  });
}

/**
 * Polls while a payment is in flight, then stops. The interval widens after the
 * first minute — a UPI collect request can sit unanswered for minutes and there
 * is nothing to gain from hammering it.
 */
export function usePaymentStatus(
  paymentId: string | null,
  options: { poll?: boolean } = {}
) {
  return useQuery({
    queryKey: queryKeys.payments.status(paymentId ?? ""),
    queryFn: () => getPaymentStatus(paymentId as string),
    enabled: Boolean(paymentId),
    refetchInterval: (query) => {
      if (!options.poll) return false;
      const data = query.state.data;
      if (!data?.pending) return false;
      return query.state.dataUpdateCount > 12 ? 10_000 : 4_000;
    }
  });
}

export function useRetryPayment() {
  return useMutation({
    mutationFn: ({
      paymentId,
      method
    }: {
      paymentId: string;
      method?: PaymentMethodKind;
    }) => retryPayment(paymentId, method)
  });
}

export function useMyBilling() {
  return useQuery({
    queryKey: queryKeys.payments.billing,
    queryFn: getMyBilling
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: CancelSubscriptionRequest;
    }) => cancelSubscription(id, data),
    onSuccess: (subscription) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      toast.success({
        title: subscription.cancelAtPeriodEnd
          ? "Subscription will end at the end of this billing period"
          : "Subscription cancelled"
      });
    }
  });
}

// ── Admin ──

export function usePaymentOverview() {
  return useQuery({
    queryKey: queryKeys.payments.adminOverview,
    queryFn: getPaymentOverview
  });
}

export function useAdminPayments(params: Partial<PaymentListQuery> = {}) {
  return useQuery({
    queryKey: queryKeys.payments.adminList(params),
    queryFn: () => getAdminPayments(params),
    placeholderData: (previous) => previous
  });
}

export function useAdminPayment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.adminDetail(id ?? ""),
    queryFn: () => getAdminPayment(id as string),
    enabled: Boolean(id)
  });
}

/**
 * A refund moves real money and cannot be recalled, so it is deliberately not
 * wrapped in useUndoableMutation — it is a policy exclusion, like an outbound
 * message. The confirmation dialog is the safeguard instead.
 */
export function useRefundPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateRefundRequest }) =>
      refundPayment(id, data),
    onSuccess: (refund) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      toast.success({
        title: "Refund requested",
        message:
          refund.status === "SUCCEEDED"
            ? "The gateway has already settled it."
            : "It will show as completed once the gateway confirms it."
      });
    }
  });
}

export function useReconcilePayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => reconcilePayment(id),
    onSuccess: (status) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      toast.info({
        title: `Gateway reports: ${status.status}`,
        message: status.message
      });
    }
  });
}

export function useRefunds() {
  return useQuery({
    queryKey: queryKeys.payments.adminRefunds,
    queryFn: getRefunds
  });
}

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: queryKeys.payments.adminSubscriptions,
    queryFn: getAdminSubscriptions
  });
}

export function useAdminInvoices() {
  return useQuery({
    queryKey: queryKeys.payments.adminInvoices,
    queryFn: getAdminInvoices
  });
}

export function useProviderHealth() {
  return useQuery({
    queryKey: queryKeys.payments.providerHealth,
    queryFn: getProviderHealth,
    refetchInterval: 60_000
  });
}

export function useRouting() {
  return useQuery({ queryKey: queryKeys.payments.routing, queryFn: getRouting });
}

export function useSaveRouting() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (config: PaymentRoutingConfig) => saveRouting(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.routing });
      toast.success({ title: "Routing saved" });
    }
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: queryKeys.payments.plans,
    queryFn: getAdminPlans
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreatePlanRequest) => createPlan(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans });
      toast.success({ title: "Plan created" });
    }
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePlanRequest }) =>
      updatePlan(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans });
      toast.success({ title: "Plan saved" });
    }
  });
}

export function useArchivePlan() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => archivePlan(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans });
      toast.success({
        title: "Plan archived",
        message: "Existing orders and invoices are untouched."
      });
    }
  });
}

// ── Discounts ──

export function useDiscounts() {
  return useQuery({
    queryKey: queryKeys.payments.discounts,
    queryFn: getDiscounts
  });
}

export function useCreateDiscount() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreateDiscountRequest) => createDiscount(data),
    onSuccess: (discount) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.discounts
      });
      toast.success({ title: `${discount.code} created` });
    }
  });
}

export function useUpdateDiscount() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDiscountRequest }) =>
      updateDiscount(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.discounts
      });
      toast.success({ title: "Discount saved" });
    }
  });
}

export function useDeleteDiscount() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteDiscount(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.discounts
      });
      toast.success({
        title: result.deleted ? "Discount deleted" : "Discount deactivated",
        message: result.deleted
          ? undefined
          : "It has already been used, so it is kept for the record."
      });
    }
  });
}

/**
 * Prices a code at checkout. Not undoable and not cached — the answer depends
 * on the chosen method and on limits that can move between attempts.
 */
export function usePreviewDiscount() {
  return useMutation({
    mutationFn: (data: ApplyDiscountRequest) => previewDiscount(data)
  });
}

// ── Per-batch pricing ──

export function useBatchPricing(batchId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.batchPricing(batchId ?? ""),
    queryFn: () => getBatchPricing(batchId as string),
    enabled: Boolean(batchId)
  });
}

export function useCreateBatchPlan(batchId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreateBatchPlanRequest) => createBatchPlan(batchId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.batchPricing(batchId)
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans });
      toast.success({ title: "Price option added" });
    }
  });
}

export function useUpdateBatchPlan(batchId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ planId, data }: { planId: string; data: UpdatePlanRequest }) =>
      updateBatchPlan(batchId, planId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.batchPricing(batchId)
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans });
      toast.success({
        title: "Price option saved",
        message: "Existing orders and subscribers keep the price they agreed to."
      });
    }
  });
}

export function useArchiveBatchPlan(batchId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (planId: string) => archiveBatchPlan(batchId, planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.batchPricing(batchId)
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans });
      toast.success({ title: "Price option archived" });
    }
  });
}

// ── Manual / offline payments (admin OR coach) ──

export function useOfflineMethods() {
  return useQuery({
    queryKey: queryKeys.payments.manualMethods,
    queryFn: getOfflineMethods
  });
}

export function useManualBatchPlans(batchId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.manualBatchPlans(batchId ?? ""),
    queryFn: () => getManualBatchPlans(batchId as string),
    enabled: Boolean(batchId)
  });
}

export function useManualBatchStudents(batchId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.manualBatchStudents(batchId ?? ""),
    queryFn: () => getManualBatchStudents(batchId as string),
    enabled: Boolean(batchId)
  });
}

export function useMyManualPayments() {
  return useQuery({
    queryKey: queryKeys.payments.manualMine,
    queryFn: getMyManualPayments
  });
}

/**
 * Not wrapped in useUndoableMutation — same policy exclusion as a refund
 * (lib/undo/README.md): this either grants access immediately (admin) or
 * opens a review request (coach), and there is no reverse endpoint for either.
 */
export function useRecordManualPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ data, file }: { data: RecordManualPaymentRequest; file?: File }) =>
      recordManualPayment(data, file),
    onSuccess: (record) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.manualMine });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.manualAdminList()
      });
      toast.success({
        title:
          record.status === "APPROVED"
            ? "Payment recorded"
            : "Submitted for admin approval",
        message:
          record.status === "APPROVED"
            ? undefined
            : "The student gets access once an admin approves it."
      });
    }
  });
}

// ── Manual / offline payments (admin) ──

export function useAdminManualPayments(status?: ManualPaymentReviewStatus) {
  return useQuery({
    queryKey: queryKeys.payments.manualAdminList(status),
    queryFn: () => getAdminManualPayments(status)
  });
}

/**
 * Approving is a one-way grant of access — same policy exclusion as a refund,
 * not wrapped in useUndoableMutation. The confirmation dialog is the safeguard.
 */
export function useApproveManualPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => approveManualPayment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      toast.success({ title: "Payment approved" });
    }
  });
}

export function useRejectManualPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectManualPayment(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      toast.success({ title: "Request rejected" });
    }
  });
}

export function useAdminOfflineMethods() {
  return useQuery({
    queryKey: queryKeys.payments.manualAdminMethods,
    queryFn: getAdminOfflineMethods
  });
}

export function useCreateOfflineMethod() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreateOfflinePaymentMethodRequest) => createOfflineMethod(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.manualAdminMethods
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.manualMethods
      });
      toast.success({ title: "Payment method added" });
    }
  });
}

export function useUpdateOfflineMethod() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOfflinePaymentMethodRequest }) =>
      updateOfflineMethod(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.manualAdminMethods
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.payments.manualMethods
      });
      toast.success({ title: "Payment method saved" });
    }
  });
}
