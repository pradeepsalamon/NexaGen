import {
  API_ROUTES,
  type AdjustReferralCreditsRequest,
  type AdminReferralDetail,
  type AdminReferralItem,
  type AdminReferralOverview,
  type CancelReferralRewardRequest,
  type CreateReferralRewardRuleRequest,
  type CreateReferralStageRequest,
  type MoveReferralStageRequest,
  type PayReferralWithdrawalRequest,
  type ReferralPage,
  type ReferralRewardItem,
  type ReferralRewardRuleItem,
  type ReferralSettingsItem,
  type ReferralStageItem,
  type ReferralWithdrawalItem,
  type ReferrerStatsItem,
  type RejectReferralWithdrawalRequest,
  type UpdateReferralRewardRuleRequest,
  type UpdateReferralSettingsRequest,
  type UpdateReferralStageRequest,
  type UpdateReferrerCodeRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { withQuery, type ReferralListParams } from "../lib/referralQuery";

const routes = API_ROUTES.adminReferrals;
type Ok = { ok: true };

export const referralAdminApi = {
  overview: () => apiFetch<AdminReferralOverview>(routes.overview),
  list: (params: ReferralListParams) => apiFetch<ReferralPage<AdminReferralItem>>(withQuery(routes.list, params)),
  get: (id: string) => apiFetch<AdminReferralDetail>(routes.get(id)),
  moveStage: (id: string, body: MoveReferralStageRequest) =>
    apiFetch<AdminReferralDetail>(routes.moveStage(id), { body, method: "PATCH" }),

  referrers: (params: ReferralListParams) => apiFetch<ReferralPage<ReferrerStatsItem>>(withQuery(routes.referrers, params)),
  updateReferrerCode: (userId: string, body: UpdateReferrerCodeRequest) =>
    apiFetch<{ code: string; isActive: boolean }>(routes.referrerCode(userId), { body, method: "PATCH" }),
  adjustCredits: (body: AdjustReferralCreditsRequest) => apiFetch<Ok>(routes.adjustCredits, { body, method: "POST" }),

  stages: () => apiFetch<ReferralStageItem[]>(routes.stages),
  createStage: (body: CreateReferralStageRequest) => apiFetch<ReferralStageItem>(routes.stages, { body, method: "POST" }),
  updateStage: (id: string, body: UpdateReferralStageRequest) =>
    apiFetch<ReferralStageItem>(routes.stage(id), { body, method: "PATCH" }),
  deleteStage: (id: string) => apiFetch<Ok>(routes.stage(id), { method: "DELETE" }),
  reorderStages: (stageIds: string[]) =>
    apiFetch<ReferralStageItem[]>(routes.reorderStages, { body: { stageIds }, method: "POST" }),

  rules: () => apiFetch<ReferralRewardRuleItem[]>(routes.rewardRules),
  createRule: (body: CreateReferralRewardRuleRequest) =>
    apiFetch<ReferralRewardRuleItem>(routes.rewardRules, { body, method: "POST" }),
  updateRule: (id: string, body: UpdateReferralRewardRuleRequest) =>
    apiFetch<ReferralRewardRuleItem>(routes.rewardRule(id), { body, method: "PATCH" }),
  deleteRule: (id: string) => apiFetch<{ deleted: boolean }>(routes.rewardRule(id), { method: "DELETE" }),

  rewards: (params: ReferralListParams) => apiFetch<ReferralPage<ReferralRewardItem>>(withQuery(routes.rewards, params)),
  approveReward: (id: string) => apiFetch<Ok>(routes.approveReward(id), { method: "POST" }),
  cancelReward: (id: string, body: CancelReferralRewardRequest) =>
    apiFetch<Ok>(routes.cancelReward(id), { body, method: "POST" }),

  withdrawals: (params: ReferralListParams) =>
    apiFetch<ReferralPage<ReferralWithdrawalItem>>(withQuery(routes.withdrawals, params)),
  payWithdrawal: (id: string, body: PayReferralWithdrawalRequest) =>
    apiFetch<Ok>(routes.payWithdrawal(id), { body, method: "POST" }),
  rejectWithdrawal: (id: string, body: RejectReferralWithdrawalRequest) =>
    apiFetch<Ok>(routes.rejectWithdrawal(id), { body, method: "POST" }),

  settings: () => apiFetch<ReferralSettingsItem>(routes.settings),
  updateSettings: (body: UpdateReferralSettingsRequest) =>
    apiFetch<ReferralSettingsItem>(routes.settings, { body, method: "PUT" })
};
