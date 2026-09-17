"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CancelPayrollPeriodRequest,
  CloseCompensationRateRequest,
  CreateCompensationRateRequest,
  CreatePayoutRequest,
  CreatePayrollAdjustmentRequest,
  CreatePayrollPeriodRequest,
  CreatePayrollRuleRequest,
  MarkPayoutPaidRequest,
  ReversePayrollAdjustmentRequest,
  UpdateCompensationProfileRequest,
  UpdatePayrollRuleRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  addCompensationRate,
  approvePayrollPeriod,
  calculatePayrollPeriod,
  cancelPayrollPeriod,
  closeCompensationRate,
  createPayout,
  createPayrollAdjustment,
  createPayrollPeriod,
  createPayrollRule,
  finalizePayrollPeriod,
  getAdminPayouts,
  getAdminPayrollPeriod,
  getAdminPayrollPeriods,
  getAdminPayrollRecord,
  getAdminPayrollRecords,
  getCompensationProfile,
  getCompensationProfiles,
  getCompensationRates,
  getMyPayrollRecord,
  getMyPayrollRecords,
  getMyPayslips,
  getPayrollAdjustments,
  getPayrollRecordAudit,
  getPayrollRules,
  markPayoutPaid,
  markPayrollPeriodPaid,
  recalculatePayrollPeriod,
  recalculatePayrollRecord,
  retryPayslipPdf,
  reversePayrollAdjustment,
  updateCompensationProfile,
  updatePayrollRule
} from "../api/payrollApi";

// ── Coach ──

export function useMyPayrollRecords() {
  return useQuery({ queryKey: queryKeys.payroll.mine, queryFn: getMyPayrollRecords });
}

export function useMyPayrollRecord(id: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.record(id ?? ""),
    queryFn: () => getMyPayrollRecord(id as string),
    enabled: Boolean(id)
  });
}

export function useMyPayslips() {
  return useQuery({ queryKey: queryKeys.payroll.myPayslips, queryFn: getMyPayslips });
}

// ── Admin: periods ──

export function useAdminPayrollPeriods() {
  return useQuery({ queryKey: queryKeys.payroll.adminPeriods, queryFn: getAdminPayrollPeriods });
}

export function useAdminPayrollPeriod(id: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminPeriod(id ?? ""),
    queryFn: () => getAdminPayrollPeriod(id as string),
    enabled: Boolean(id)
  });
}

export function useCreatePayrollPeriod() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: CreatePayrollPeriodRequest) => createPayrollPeriod(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminPeriods });
      toast.success({ title: "Payroll period created" });
    }
  });
}

/** One hook drives every period lifecycle action — same request shape, different endpoint. */
function usePeriodAction(
  fn: (id: string) => Promise<{ period: unknown }>,
  successTitle: string
) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => fn(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminPeriods });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminPeriod(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminRecords(id) });
      toast.success({ title: successTitle });
    }
  });
}

export function useCalculatePayrollPeriod() {
  return usePeriodAction(calculatePayrollPeriod, "Payroll calculated");
}

export function useRecalculatePayrollPeriod() {
  return usePeriodAction(recalculatePayrollPeriod, "Payroll recalculated");
}

export function useApprovePayrollPeriod() {
  return usePeriodAction(approvePayrollPeriod, "Payroll period approved");
}

export function useFinalizePayrollPeriod() {
  return usePeriodAction(finalizePayrollPeriod, "Payroll period finalized");
}

export function useMarkPayrollPeriodPaid() {
  return usePeriodAction(markPayrollPeriodPaid, "Payroll period marked paid");
}

export function useCancelPayrollPeriod() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CancelPayrollPeriodRequest }) =>
      cancelPayrollPeriod(id, body),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminPeriods });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminPeriod(id) });
      toast.success({ title: "Payroll period cancelled" });
    }
  });
}

// ── Admin: records ──

export function useAdminPayrollRecords(periodId: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminRecords(periodId ?? ""),
    queryFn: () => getAdminPayrollRecords(periodId as string),
    enabled: Boolean(periodId)
  });
}

export function useAdminPayrollRecord(id: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminRecord(id ?? ""),
    queryFn: () => getAdminPayrollRecord(id as string),
    enabled: Boolean(id)
  });
}

export function useRecalculatePayrollRecord() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => recalculatePayrollRecord(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminRecord(result.record.id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.adminRecords(result.record.periodId)
      });
      toast.success({ title: "Payroll recalculated" });
    }
  });
}

export function usePayrollRecordAudit(recordId: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminAudit(recordId ?? ""),
    queryFn: () => getPayrollRecordAudit(recordId as string),
    enabled: Boolean(recordId)
  });
}

// ── Admin: adjustments ──

export function usePayrollAdjustments(recordId: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminAdjustments(recordId ?? ""),
    queryFn: () => getPayrollAdjustments(recordId as string),
    enabled: Boolean(recordId)
  });
}

export function useCreatePayrollAdjustment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ recordId, body }: { recordId: string; body: CreatePayrollAdjustmentRequest }) =>
      createPayrollAdjustment(recordId, body),
    onSuccess: (_result, { recordId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminAdjustments(recordId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminRecord(recordId) });
      toast.success({ title: "Adjustment added" });
    }
  });
}

export function useReversePayrollAdjustment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      id,
      body
    }: {
      id: string;
      recordId: string;
      body: ReversePayrollAdjustmentRequest;
    }) => reversePayrollAdjustment(id, body),
    onSuccess: (_result, { recordId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminAdjustments(recordId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminRecord(recordId) });
      toast.success({ title: "Adjustment reversed" });
    }
  });
}

// ── Admin: compensation profiles & rates ──

export function useCompensationProfiles() {
  return useQuery({
    queryKey: queryKeys.payroll.adminCompensationProfiles,
    queryFn: getCompensationProfiles
  });
}

export function useCompensationProfile(coachId: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminCompensationProfile(coachId ?? ""),
    queryFn: () => getCompensationProfile(coachId as string),
    enabled: Boolean(coachId)
  });
}

export function useUpdateCompensationProfile() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ coachId, body }: { coachId: string; body: UpdateCompensationProfileRequest }) =>
      updateCompensationProfile(coachId, body),
    onSuccess: (_result, { coachId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminCompensationProfiles });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.adminCompensationProfile(coachId)
      });
      toast.success({ title: "Compensation profile saved" });
    }
  });
}

export function useCompensationRates(coachId: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminCompensationRates(coachId ?? ""),
    queryFn: () => getCompensationRates(coachId as string),
    enabled: Boolean(coachId)
  });
}

export function useAddCompensationRate() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ coachId, body }: { coachId: string; body: CreateCompensationRateRequest }) =>
      addCompensationRate(coachId, body),
    onSuccess: (_result, { coachId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminCompensationRates(coachId) });
      toast.success({ title: "Rate added" });
    }
  });
}

export function useCloseCompensationRate() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      id,
      body
    }: {
      id: string;
      coachId: string;
      body: CloseCompensationRateRequest;
    }) => closeCompensationRate(id, body),
    onSuccess: (_result, { coachId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminCompensationRates(coachId) });
      toast.success({ title: "Rate ended" });
    }
  });
}

// ── Admin: rules ──

export function usePayrollRules() {
  return useQuery({ queryKey: queryKeys.payroll.adminRules, queryFn: getPayrollRules });
}

export function useCreatePayrollRule() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: CreatePayrollRuleRequest) => createPayrollRule(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminRules });
      toast.success({ title: "Rule created" });
    }
  });
}

export function useUpdatePayrollRule() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePayrollRuleRequest }) =>
      updatePayrollRule(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.adminRules });
      toast.success({ title: "Rule updated" });
    }
  });
}

// ── Admin: payouts ──

export function useAdminPayouts(periodId: string | null) {
  return useQuery({
    queryKey: queryKeys.payroll.adminPayouts(periodId ?? ""),
    queryFn: () => getAdminPayouts(periodId as string),
    enabled: Boolean(periodId)
  });
}

export function useCreatePayout() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: CreatePayoutRequest) => createPayout(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
      toast.success({ title: "Payout created" });
    }
  });
}

export function useMarkPayoutPaid() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MarkPayoutPaidRequest }) =>
      markPayoutPaid(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
      toast.success({ title: "Payout marked paid" });
    }
  });
}

// ── Admin: payslips ──

export function useRetryPayslipPdf() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => retryPayslipPdf(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
      toast.success({ title: "Payslip regeneration queued" });
    }
  });
}
